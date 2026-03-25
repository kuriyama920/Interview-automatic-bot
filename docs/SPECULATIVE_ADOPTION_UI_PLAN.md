# Speculative → Committed 採用判定 UI改善 実装計画

## 1. 概要

### 1.1 現状の問題

Committed生成開始時に `setResponse(null)` で Speculative 結果がクリアされ、画面がチラつく。
採用判定（Levenshtein距離 + 適応閾値）は実行されるが、結果はメトリクス記録のみで UI に反映されない。

### 1.2 目標

- **品質**: Committed生成は常に実行（RAG + プロファイル付き回答を担保）
- **レイテンシ体感**: Speculative結果を表示し続け、空白時間をゼロにする
- **採用判定をUIに反映**: 採用ならSpeculative維持、不採用ならスムーズに差し替え

### 1.3 タイムライン比較

```
【現状】
Speculative表示 → Committed開始 → 画面クリア → Committed第1チャンク → ... → 完了
                                  ^^^^^^^^
                                  空白時間（チラつき）

【改善後】
Speculative表示 → Committed開始（バックグラウンド蓄積）→ 完了 → 採用判定
                  Speculative表示を維持 ─────────────────┘
                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                  空白時間ゼロ

  採用: Speculative表示をそのまま確定（即時）
  不採用: Committed結果にフェード遷移（300ms）
```

---

## 2. 現状のアーキテクチャ分析

### 2.1 IPC通信チェーン全体図

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer Process                                             │
│                                                              │
│  useProgressiveAI                                            │
│    │ interim → generateStreamResponseV2('speculative')       │
│    │ final   → generateStreamResponseV2('committed')         │
│    ▼                                                         │
│  useAIResponse                                               │
│    │ state: streamingText, response, isGenerating,           │
│    │        currentPhase, error                               │
│    │ IPC invoke → 'ai:generateStreamV2'                      │
│    │                                                         │
│    │ listeners (1回のみ登録):                                │
│    │   'ai:chunk'    → setStreamingText(prev + chunk)        │
│    │   'ai:phase'    → setCurrentPhase(phase)                │
│    │   'ai:complete' → ログのみ（レスポンスはIPC返り値で設定）│
│    │   'ai:error'    → setError(msg)                         │
│    ▼                                                         │
│  InterviewContext                                            │
│    │ W-01: isGenerating true→false検知 → 採用判定            │
│    │ speculativeTextRef同期                                  │
│    ▼                                                         │
│  AIResponsePanel                                             │
│    displayText = isGenerating                                │
│      ? (streamingText || aiResponse?.answer)                 │
│      : (aiResponse?.answer || streamingText)                 │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (invoke/send)
┌──────────────────────▼──────────────────────────────────────┐
│ Main Process                                                 │
│                                                              │
│  ipc.ts                                                      │
│    ipcMain.handle('ai:generateStreamV2', ...)                │
│      → currentAIAbortController.abort() (前の生成を中止)     │
│      → aiService.generateStreamResponseV2(                   │
│            question, context, phase,                         │
│            { onChunk, onPhase }, signal, options              │
│        )                                                     │
│      → mainWindow.webContents.send('ai:chunk', chunk)        │
│      → mainWindow.webContents.send('ai:phase', phase)        │
│      → mainWindow.webContents.send('ai:complete', response)  │
│      → return { success: true, response }                    │
│                                                              │
│  ai.service.ts                                               │
│    POST /api/ai/generate-v2 (SSE)                            │
│      → parseSSEResponse → onChunk callbacks                  │
│      → return AIResponse { answer, suggestions, confidence } │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 重要な発見: `ai:chunk` にphase情報がない

**現状のIPCイベント構造:**
```typescript
// preload/index.ts:152-153
onChunk: (callback: (chunk: string) => void) => {
  ipcRenderer.on('ai:chunk', (_event, chunk) => callback(chunk))
}
```

- `ai:chunk` イベントは **chunk (string)** のみを送信
- **どのphase (speculative/committed) のチャンクかを判別する情報がない**
- 現状は単一の `streamingText` に蓄積するため問題なかったが、二重バッファではphase判別が必須

**→ 対策**: `onPhase` イベントが先に到達するため、`currentPhaseRef` で最新phaseを保持し、onChunk内で参照する

### 2.3 generationIdRef のレースコンディション制御

```typescript
// useAIResponse.ts:234
const thisGeneration = ++generationIdRef.current  // ← Committed開始でインクリメント

// useAIResponse.ts:157
if (generationIdRef.current !== thisGeneration) return  // ← IPC返り値で世代チェック
```

**重要**: onChunkリスナーは `generationIdRef` をチェック**しない**。
pendingClearRef で最初のチャンクのみ制御し、以降は無条件で `streamingText` に追記。

**→ 改善後の影響**: Committed開始時に `generationIdRef` がインクリメントされると、Speculative の IPC返り値ハンドラーは無視される（thisGeneration が古い）。
ただし、Speculative の onChunk は generationId をチェックしないため、理論上はCommitted チャンクと混在する可能性がある。
**実際には**: Speculative API呼び出しが先に完了し、Committed のチャンクが始まるまでにラグがあるため、混在は発生しない。
さらに `pendingClearRef` が Committed の最初のチャンクで `setStreamingText(chunk)` とリセットするため安全。

### 2.4 現在の useAIResponse state更新シーケンス

#### Speculative 開始時
```
generateStreamResponseV2('speculative') 呼出
  → generationIdRef++ (例: 1→2)
  → setIsGenerating(true)
  → setError(null)
  → setCurrentPhase('speculative')
  → pendingClearRef = true
  → IPC invoke 'ai:generateStreamV2'
```

#### Committed 開始時（★問題箇所）
```
generateStreamResponseV2('committed') 呼出
  → generationIdRef++ (例: 2→3)
  → setIsGenerating(true)
  → setError(null)
  → setCurrentPhase('committed')
  → ★ setResponse(null)  ← Speculative結果がクリアされる
  → pendingClearRef = true  ← 次のチャンクでstreamingTextが上書きされる
  → IPC invoke 'ai:generateStreamV2'
```

#### Committed 完了時
```
executeStreamGeneration IPC返り値
  → generationIdRef チェック（一致なら続行）
  → setResponse(result.response)
  → setIsGenerating(false)
  → setCurrentPhase(null)
```

### 2.5 AIResponsePanel の displayText 計算

```typescript
// AIResponsePanel.tsx:75-77
const displayText = isGenerating
  ? (streamingText || aiResponse?.answer)     // 生成中: streamingText優先
  : (aiResponse?.answer || streamingText)     // 完了後: aiResponse優先
```

**Committed開始時の問題:**
1. `setResponse(null)` → `aiResponse` が null に
2. `pendingClearRef = true` → 次のチャンクで `setStreamingText(chunk)` に上書き
3. チャンク到着まで `streamingText` は前のSpeculative値を保持するが...
4. チャンク到着時に `setStreamingText(chunk)` で完全置換 → 画面がチラつく

### 2.6 採用判定ロジック（変更不要）

```
shouldAdoptSpeculative(specText, committedText, config)
  │
  ├─ Guard Rail 1: specText.length < 80 → 不採用 ('speculative_too_short')
  ├─ Guard Rail 2: countSentences(specText) < 2 → 不採用 ('too_few_sentences')
  ├─ changeRate > threshold → 不採用 ('change_rate_exceeded')
  └─ すべてパス → 採用 ('accepted')

AdaptiveThreshold:
  records < 20 → threshold = 0.3
  adoptionRate > 70% → threshold = 0.4（緩和）
  adoptionRate < 30% → threshold = 0.2（厳格化）
  それ以外 → threshold = 0.3
```

---

## 3. ベストプラクティス（業界のデファクトスタンダード）

### 3.1 Optimistic UI パターン（React）

**定義**: 操作結果を楽観的に即座にUIに反映し、サーバー応答後に確認/ロールバックする。

- **Meta/Instagram**: いいね、コメント投稿を即座に反映、失敗時にロールバック
- **GitHub Copilot**: Ghost text（薄い色）で候補を表示、Tab確定/Esc取消
- **Cursor AI**: 差分をインライン表示、確定前は薄い色、Accept/Reject

### 3.2 Double Buffering パターン

**定義**: フロントバッファ（表示用）とバックバッファ（準備用）を分離し、準備完了時に swap する。

- GPU レンダリング、ビデオプレーヤーのプリロードで広く使用
- React では「2つの state を持ち、条件によって表示を切り替える」形で実現

### 3.3 本プロジェクトへの適用

| パターン | 適用 |
|----------|------|
| Optimistic UI | Speculative結果を「楽観的な回答」として即座に表示 |
| Double Buffer | `streamingText`（フロント）と `committedStreamingText`（バック）の分離 |
| Ghost Text (Copilot式) | Speculative を薄い色・イタリックで表示（既に実装済み） |
| Smooth Transition | 不採用時のフェードアニメーション |

---

## 4. 変更対象ファイルと詳細な編集箇所

### 4.1 useAIResponse.ts（最大の変更）

#### 4.1.1 新規 state / ref 追加（31行目付近）

```typescript
// 追加する state
const [committedStreamingText, setCommittedStreamingText] = useState<string>('')
const [committedResponse, setCommittedResponse] = useState<AIResponse | null>(null)

// 追加する ref
const currentPhaseRef = useRef<AIPhase | null>(null)  // onChunk内でのphase判別用
const pendingCommittedClearRef = useRef(false)         // Committed用の別pendingClear
```

#### 4.1.2 onPhase リスナー変更（100-108行目）

**現状:**
```typescript
window.electron.ai.onPhase((phase: string) => {
  if (!mountedRef.current) return
  log.info('Phase change received', { phase })
  setCurrentPhase(phase as AIPhase)
  if (phase === 'detailed') {
    pendingClearRef.current = true
  }
})
```

**変更後:**
```typescript
window.electron.ai.onPhase((phase: string) => {
  if (!mountedRef.current) return
  log.info('Phase change received', { phase })
  setCurrentPhase(phase as AIPhase)
  currentPhaseRef.current = phase as AIPhase  // ★追加: ref同期
  if (phase === 'detailed') {
    pendingClearRef.current = true
  }
})
```

#### 4.1.3 onChunk リスナー変更（53-88行目）

**現状:** 全チャンクを `streamingText` に蓄積

**変更後:** `currentPhaseRef` を参照し、committed phaseのチャンクは `committedStreamingText` に振り分け

```typescript
window.electron.ai.onChunk((chunk: string) => {
  if (!mountedRef.current) return

  // メトリクス記録（変更なし）
  // ...

  const isCommittedPhase = currentPhaseRef.current === 'committed'

  if (isCommittedPhase) {
    // ★ Committed チャンク → バックバッファに蓄積
    if (pendingCommittedClearRef.current) {
      pendingCommittedClearRef.current = false
      setCommittedStreamingText(chunk)
    } else {
      setCommittedStreamingText((prev) => prev + chunk)
    }
  } else {
    // Speculative チャンク → フロントバッファ（従来通り）
    if (pendingClearRef.current) {
      pendingClearRef.current = false
      setStreamingText(chunk)
    } else {
      setStreamingText((prev) => prev + chunk)
    }
  }

  // メトリクス m11 記録（変更なし）
  // ...
})
```

#### 4.1.4 generateStreamResponseV2 変更（223-259行目）

**現状（239-242行目）:**
```typescript
if (phase === 'committed') {
  setResponse(null)  // ★ これがチラつきの原因
}
pendingClearRef.current = true
```

**変更後:**
```typescript
if (phase === 'committed') {
  // ★ Speculative側は触らない → チラつき防止の核心
  setCommittedStreamingText('')
  setCommittedResponse(null)
  pendingCommittedClearRef.current = true
} else {
  pendingClearRef.current = true
}
```

#### 4.1.5 executeStreamGeneration 変更（142-191行目）

**現状（159-164行目）:**
```typescript
if (result.success) {
  if (result.response) {
    setResponse(result.response)
  }
  setIsGenerating(false)
  setCurrentPhase(null)
}
```

**変更後:**
```typescript
if (result.success) {
  if (result.response) {
    // ★ Committed完了時はバックバッファに格納
    if (currentPhaseRef.current === 'committed') {
      setCommittedResponse(result.response)
    } else {
      setResponse(result.response)
    }
  }
  setIsGenerating(false)
  // ★ currentPhaseは null にしない（採用判定トリガーまで維持）
  // → InterviewContext の W-01 で判定後にクリアする
}
```

**注意**: `currentPhaseRef.current` は IPC返り値時点では `'committed'` のはず。
しかし、新しいSpeculativeが開始されていた場合は `'speculative'` になっている可能性がある。
この場合 `generationIdRef` のチェック（157行目）で既に弾かれているため問題ない。

#### 4.1.6 return オブジェクト拡張（268-278行目）

**追加する関数と state:**
```typescript
// 採用時: Committed結果を破棄し、Speculative表示を確定
const discardCommittedResult = useCallback(() => {
  // Speculative の streamingText をそのまま response に昇格
  setResponse((prev) => prev ?? { answer: streamingText, suggestions: [], confidence: 0.8 })
  setCommittedStreamingText('')
  setCommittedResponse(null)
  setCurrentPhase(null)
  currentPhaseRef.current = null
}, [streamingText])

// 不採用時: Committed結果をフロントバッファに反映
const applyCommittedResult = useCallback(() => {
  if (committedResponse) {
    setResponse(committedResponse)
    setStreamingText(committedResponse.answer)
  } else {
    setStreamingText(committedStreamingText)
  }
  setCommittedStreamingText('')
  setCommittedResponse(null)
  setCurrentPhase(null)
  currentPhaseRef.current = null
}, [committedResponse, committedStreamingText])

return {
  response,
  streamingText,
  isGenerating,
  error,
  currentPhase,
  committedStreamingText,    // ★追加
  committedResponse,         // ★追加
  applyCommittedResult,      // ★追加
  discardCommittedResult,    // ★追加
  generateStreamResponse,
  generateStreamResponseV2,
  abortGeneration,
  clearResponse,
}
```

#### 4.1.7 UseAIResponseReturn インターフェース更新（18-28行目）

```typescript
interface UseAIResponseReturn {
  response: AIResponse | null
  streamingText: string
  isGenerating: boolean
  error: string | null
  currentPhase: AIPhase | null
  committedStreamingText: string        // ★追加
  committedResponse: AIResponse | null  // ★追加
  applyCommittedResult: () => void      // ★追加
  discardCommittedResult: () => void    // ★追加
  generateStreamResponse: (question: string, context?: string, options?: GenerateOptions) => Promise<void>
  generateStreamResponseV2: (question: string, context?: string, phase?: 'speculative' | 'committed', options?: GenerateOptions) => Promise<void>
  abortGeneration: () => void
  clearResponse: () => void
}
```

---

### 4.2 InterviewContext.tsx

#### 4.2.1 useAIResponse デストラクチャリング拡張（78-88行目）

```typescript
const {
  response: aiResponse,
  streamingText,
  isGenerating,
  error: aiError,
  currentPhase,
  committedStreamingText,    // ★追加
  committedResponse,         // ★追加
  applyCommittedResult,      // ★追加
  discardCommittedResult,    // ★追加
  generateStreamResponse,
  generateStreamResponseV2,
  abortGeneration,
  clearResponse,
} = useAIResponse({ onMetrics: latencyMetrics })
```

#### 4.2.2 adoptionState の追加（141行目付近）

```typescript
// ★追加: 採用判定結果のUI状態
const [adoptionState, setAdoptionState] = useState<'none' | 'adopted' | 'replaced'>('none')
```

#### 4.2.3 W-01 useEffect 拡張（143-177行目）

**現状:** メトリクス記録のみ

**変更後:** メトリクス記録 + UI制御

```typescript
useEffect(() => {
  const wasGenerating = prevIsGeneratingRef.current
  prevIsGeneratingRef.current = isGenerating

  if (wasGenerating && !isGenerating && pendingCommittedTurnIdRef.current) {
    const turnId = pendingCommittedTurnIdRef.current
    const specText = speculativeTextRef.current
    const committedText = committedResponse?.answer || committedStreamingText  // ★変更: バックバッファから取得

    if (specText && committedText) {
      const adaptiveConfig = {
        ...DEFAULT_ADOPTION_CONFIG,
        changeRateThreshold: adaptiveThresholdRef.current.getThreshold(),
      }
      const result = shouldAdoptSpeculative(specText, committedText, adaptiveConfig)

      adaptiveThresholdRef.current.recordAdoption(result.adopted)

      latencyMetrics.record(turnId, 'speculative_adopted', result.adopted)
      latencyMetrics.record(turnId, 'speculative_changeRate', result.changeRate)
      latencyMetrics.record(turnId, 'speculative_reason', result.reason)
      latencyMetrics.record(turnId, 'adaptive_threshold', adaptiveConfig.changeRateThreshold)

      // ★追加: 採用判定結果でUI制御
      if (result.adopted) {
        discardCommittedResult()
        setAdoptionState('adopted')
      } else {
        applyCommittedResult()
        setAdoptionState('replaced')
      }
    } else if (!specText && (committedResponse || committedStreamingText)) {
      // Speculativeなし → Committed結果をそのまま適用
      applyCommittedResult()
      setAdoptionState('none')
    }

    pendingCommittedTurnIdRef.current = null

    if (turnCount > RECENT_TURN_COUNT) {
      triggerSummarize()
    }
  }
}, [isGenerating, committedResponse, committedStreamingText, latencyMetrics, /* ... */])
```

#### 4.2.4 adoptionState のリセット

新しいSpeculative開始時にリセットが必要:

```typescript
// speculativeTextRef同期の拡張 (92-96行目)
useEffect(() => {
  if (currentPhase === 'speculative') {
    speculativeTextRef.current = streamingText
    // ★追加: 新しいSpeculative開始時にadoptionStateをリセット
    if (adoptionState !== 'none') {
      setAdoptionState('none')
    }
  }
}, [currentPhase, streamingText, adoptionState])
```

#### 4.2.5 InterviewContextValue に adoptionState を追加

```typescript
interface InterviewContextValue {
  // ... 既存フィールド
  adoptionState: 'none' | 'adopted' | 'replaced'  // ★追加
}
```

---

### 4.3 AIResponsePanel.tsx

#### 4.3.1 コンテキストから adoptionState を取得（56行目）

```typescript
const { aiResponse, streamingText, isGenerating, currentPhase, cachedMatch, adoptionState } = useInterview()
```

#### 4.3.2 displayText ロジック更新（75-77行目）

**現状:**
```typescript
const displayText = isGenerating
  ? (streamingText || aiResponse?.answer)
  : (aiResponse?.answer || streamingText)
```

**変更後:**
```typescript
const displayText = isGenerating
  ? (streamingText || aiResponse?.answer)     // 生成中: Speculative結果を維持表示
  : (aiResponse?.answer || streamingText)     // 完了後: 採用判定結果が反映済み
```

**注意**: このロジック自体は変更不要。なぜなら:
- Committed生成中: `isGenerating=true`, `streamingText` にはSpeculative結果が残っている（クリアしないため）
- 採用判定後: `applyCommittedResult()` または `discardCommittedResult()` が `response` と `streamingText` を適切に設定

#### 4.3.3 PhaseIndicator 更新（27-53行目）

Committed生成中の表示を追加:

```typescript
function PhaseIndicator({ phase, isGenerating }: { phase: string | null; isGenerating: boolean }) {
  if (!isGenerating) return null

  if (phase === 'speculative') {
    return (
      <span className="text-[10px] text-accent/60 flex items-center gap-1.5 animate-pulse">
        <Spinner size="sm" className="text-accent/60" />
        下書き中...
      </span>
    )
  }

  if (phase === 'committed') {
    // ★変更: Committed生成中もSpeculative表示を維持しているため、異なるメッセージ
    return (
      <span className="text-[10px] text-accent/70 flex items-center gap-1.5 animate-pulse">
        <Spinner size="sm" className="text-accent/70" />
        確定版を生成中...
      </span>
    )
  }

  if (phase === 'transitioning') {
    return (
      <span className="text-[10px] text-success flex items-center gap-1.5">
        確認中...
      </span>
    )
  }

  return (
    <span className="text-[10px] text-accent flex items-center gap-1.5 animate-pulse">
      <Spinner size="sm" className="text-accent" />
      生成中...
    </span>
  )
}
```

#### 4.3.4 フェードトランジション（132-163行目付近）

不採用時の差し替えアニメーション:

```typescript
// ★追加: フェード制御用state
const [isFading, setIsFading] = useState(false)
const prevAdoptionStateRef = useRef(adoptionState)

useEffect(() => {
  if (prevAdoptionStateRef.current !== adoptionState && adoptionState === 'replaced') {
    setIsFading(true)
    const timer = setTimeout(() => setIsFading(false), 150)
    return () => clearTimeout(timer)
  }
  prevAdoptionStateRef.current = adoptionState
}, [adoptionState])
```

chat-bubble の className に反映:
```typescript
<div
  className={[
    'chat-bubble text-[13px] leading-relaxed min-h-0 font-medium whitespace-pre-wrap transition-all duration-300',
    isSpeculative
      ? 'bg-accent/5 text-content/50 italic'
      : 'bg-accent/10 text-content',
    isFading ? 'opacity-0' : 'opacity-100',  // ★追加
  ].join(' ')}
>
```

#### 4.3.5 スケルトン表示条件（121行目）

**現状:**
```typescript
} : isGenerating && !streamingText ? (
  <AIResponseSkeleton />
```

**変更後:**
```typescript
} : isGenerating && !streamingText && currentPhase !== 'committed' ? (
  // ★変更: Committed生成中はSpeculativeの結果が残っているのでスケルトン不要
  <AIResponseSkeleton />
```

#### 4.3.6 Committed生成中のヘッダー表示（136-140行目）

```typescript
<div className="chat-header text-[10px] mb-0.5">
  {isSpeculative ? (
    <span className="text-accent/50 italic">下書き（確定前）</span>
  ) : currentPhase === 'committed' && isGenerating ? (
    // ★追加: Committed生成中にSpeculative表示を維持している状態
    <span className="text-accent/50 italic">下書き表示中（確定版を生成中）</span>
  ) : (
    <span className="text-content-secondary">AI アシスタント</span>
  )}
</div>
```

---

### 4.4 useProgressiveAI.ts（変更最小限）

#### 4.4.1 確認事項

| 項目 | 結果 |
|------|------|
| speculativeTextRef の更新タイミング | InterviewContext.tsx:92-96 で `currentPhase === 'speculative'` 時に同期 → 変更不要 |
| Committed呼び出し前のspeculativeTextRef値 | processFinalTranscripts実行時点で最終値を保持 → 変更不要 |
| abort呼び出しの影響 | Committed生成前に明示的abortなし → 変更不要 |
| pendingCommittedTurnIdRef | Committed生成ごとにセット、W-01で消費 → 変更不要 |

**結論: useProgressiveAI.ts は変更不要**

---

### 4.5 変更不要のファイル

| ファイル | 理由 |
|----------|------|
| `src/renderer/src/utils/speculative-adoption.ts` | 採用判定ロジックそのまま流用 |
| `src/renderer/src/utils/adaptive-threshold.ts` | 閾値調整ロジックそのまま流用 |
| `src/renderer/src/utils/speculative-cache.ts` | キャッシュロジック影響なし |
| `src/main/ipc.ts` | IPC通信チャネル変更なし |
| `src/preload/index.ts` | preload API変更なし |
| `src/services/ai.service.ts` | バックエンド通信変更なし |
| `src/types/shared.ts` | 共有型定義変更なし |

---

## 5. リスク分析

### 5.1 高リスク

| リスク | 説明 | 軽減策 |
|--------|------|--------|
| **onChunk の phase振り分け** | `currentPhaseRef` の更新と `onChunk` 到着の順序 | `onPhase` は `onChunk` より先に送信される（ai.service.ts の SSE パース順序による）。さらに `pendingCommittedClearRef` で最初のチャンクを確実に分離 |
| **Speculative→Committed の間のチャンク混在** | Speculative API完了後、Committed の `onPhase` 到着前にチャンクが来る可能性 | Main process の `currentAIAbortController.abort()` で前の生成を中止するため、Speculative完了→Committed開始の間にチャンクは来ない |

### 5.2 中リスク

| リスク | 説明 | 軽減策 |
|--------|------|--------|
| **isGenerating のfalse遷移タイミング** | Committed完了時に `setIsGenerating(false)` → W-01トリガー。この時点で `committedResponse` が確実にセットされているか | `executeStreamGeneration` 内で `setCommittedResponse` → `setIsGenerating(false)` の順序で呼び出すため、React の batch update により同一レンダリングサイクルで処理される |
| **新しいSpeculativeが始まった場合** | Committed生成中に次の発話が来てSpeculativeが開始 | `generationIdRef++` でCommitted の IPC返り値は無視される。`committedStreamingText` は次のCommitted開始時にクリアされる |

### 5.3 低リスク

| リスク | 説明 | 軽減策 |
|--------|------|--------|
| **adoptionState のstale値** | 前ターンの `adoptionState` が次ターンに残る | Speculative開始時にリセット（4.2.4参照） |
| **discardCommittedResult の streamingText 依存** | useCallback の依存配列に `streamingText` が含まれ、関数の再生成が多い | 性能上の影響は微小（React batch update） |

---

## 6. テスト計画

### 6.1 ユニットテスト（変更なしで通過するはず）

- `speculative-adoption.test.ts` — ロジック変更なし
- `adaptive-threshold.test.ts` — ロジック変更なし

### 6.2 新規ユニットテスト

| テストケース | 対象 | 検証内容 |
|-------------|------|---------|
| Committed チャンクがバックバッファに蓄積 | useAIResponse | `committedStreamingText` が更新される |
| Speculative チャンクがフロントバッファに蓄積 | useAIResponse | `streamingText` が更新される（従来通り） |
| applyCommittedResult が state を正しく更新 | useAIResponse | `response` と `streamingText` が Committed 結果に |
| discardCommittedResult が Speculative を昇格 | useAIResponse | `response.answer === streamingText` |
| Committed開始時に streamingText がクリアされない | useAIResponse | `streamingText` が前の値を保持 |

### 6.3 統合テスト

| テストケース | 検証内容 |
|-------------|---------|
| Speculative → Committed → 採用 | streamingText が Committed中も Speculative値を維持、判定後も維持 |
| Speculative → Committed → 不採用 | Committed完了後に streamingText が Committed結果に差し替え |
| Speculative なし → Committed | 従来通りの動作 |
| Committed中に新しい発話 | generationIdRef でCommitted結果が無視される |

### 6.4 手動検証

- [ ] 面接シミュレーションで画面のチラつきがないこと
- [ ] 不採用時のフェードトランジションが自然であること
- [ ] PhaseIndicator が各状態で正しく表示されること
- [ ] 高速な発話切り替え時にstateが破綻しないこと

---

## 7. 実装順序（依存関係グラフ）

```
Phase 1: useAIResponse.ts 二重バッファ構造
  ├── 1.1 state/ref 追加
  ├── 1.2 onPhase に currentPhaseRef 同期追加
  ├── 1.3 onChunk phase振り分け ← 1.1, 1.2
  ├── 1.4 generateStreamResponseV2 Committed開始時変更 ← 1.1
  ├── 1.5 executeStreamGeneration 完了処理変更 ← 1.1
  ├── 1.6 applyCommittedResult / discardCommittedResult ← 1.1
  └── 1.7 return + interface 更新 ← 1.6
       ↓
Phase 2: InterviewContext.tsx 採用判定UI反映 ← Phase 1 完了
  ├── 2.1 useAIResponse 新プロパティ受け取り
  ├── 2.2 adoptionState 追加
  ├── 2.3 W-01 useEffect 拡張 ← 2.1, 2.2
  ├── 2.4 adoptionState リセットロジック
  └── 2.5 InterviewContextValue 更新
       ↓
Phase 3: AIResponsePanel.tsx 表示改善 ← Phase 2 完了
  ├── 3.1 adoptionState 取得
  ├── 3.2 PhaseIndicator 更新
  ├── 3.3 スケルトン表示条件修正
  ├── 3.4 ヘッダー表示更新
  └── 3.5 フェードトランジション追加
```

---

## 8. 変更量サマリー

| ファイル | 行数（概算） | 変更種別 |
|----------|-------------|---------|
| `useAIResponse.ts` | +80行, ~20行修正 | state追加、onChunk振り分け、generate変更、関数追加 |
| `InterviewContext.tsx` | +30行, ~15行修正 | 新state、W-01拡張、リセットロジック |
| `AIResponsePanel.tsx` | +25行, ~10行修正 | フェード、PhaseIndicator、スケルトン条件 |
| `useProgressiveAI.ts` | 0行 | 変更なし |
| **合計** | **+135行, ~45行修正** | |
