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

---

## 9. レビュー指摘への対応（Rev.2 修正）

以下は外部レビューで指摘された11件の問題と、計画への修正内容です。

### 9.1 [CRITICAL] #1: currentPhaseRef が generateStreamResponseV2 で未更新

**問題**: `generateStreamResponseV2` L237 で `setCurrentPhase(phase)` するが、`currentPhaseRef` は
`onPhase` IPC イベント到着時にしか更新されない。v2 の SSE ストリームは committed/speculative 開始時に
`ai:phase` イベントを送信する保証がなく、`onChunk` が先に到着すると振り分けが誤る。

**根拠**: ai.service.ts の `parseSSEResponse` はSSEデータの `type === 'phase'` をパースして `onPhase` を
呼ぶが、Worker側が committed 開始時に phase イベントを送るかはレスポンス依存。
一方 `generateStreamResponseV2` は renderer 側で即座に `setCurrentPhase(phase)` を呼ぶ（L237）。
`currentPhaseRef` もここで同期しないと、最初のチャンク振り分けが不正確になる。

**修正**: セクション 4.1.4 の変更後コードを以下に修正:

```typescript
// generateStreamResponseV2 内（L234-242付近）
const thisGeneration = ++generationIdRef.current
setIsGenerating(true)
setError(null)
setCurrentPhase(phase ?? null)
currentPhaseRef.current = phase ?? null  // ★修正: refも即座に同期

if (phase === 'committed') {
  setCommittedStreamingText('')
  setCommittedResponse(null)
  pendingCommittedClearRef.current = true
} else {
  pendingClearRef.current = true
}
```

---

### 9.2 [HIGH] #2: Committed エラーで Speculative 消失

**問題**: `onError` ハンドラー（L110-116）で `setStreamingText('')` が呼ばれるため、
Committed 生成がエラーになった場合にフロントバッファの Speculative 結果が消失する。

**根拠**:
```typescript
// 現行コード L110-116
window.electron.ai.onError((errorMessage: string) => {
  setError(errorMessage)
  setIsGenerating(false)
  setStreamingText('')  // ← Committed エラー時に Speculative が消える
})
```

**修正**: onError を phase-aware に変更:

```typescript
window.electron.ai.onError((errorMessage: string) => {
  if (!mountedRef.current) return
  setError(errorMessage)
  setIsGenerating(false)

  if (currentPhaseRef.current === 'committed') {
    // ★修正: Committed エラー時は Speculative を保持し、Committed バッファのみクリア
    setCommittedStreamingText('')
    setCommittedResponse(null)
    pendingCommittedClearRef.current = false
  } else {
    setStreamingText('')
  }

  setCurrentPhase(null)
  currentPhaseRef.current = null
  log.error('AI stream error received', { error: errorMessage })
})
```

---

### 9.3 [HIGH] #3: abortGeneration で新 state 未リセット

**問題**: `abortGeneration`（L129-138）に新しい state/ref のリセットが含まれていない。

**修正**:

```typescript
const abortGeneration = useCallback(() => {
  generationIdRef.current++
  window.electron.ai.abort()
  setIsGenerating(false)
  setStreamingText('')
  setCurrentPhase(null)
  pendingClearRef.current = false
  // ★追加: 新 state/ref のリセット
  setCommittedStreamingText('')
  setCommittedResponse(null)
  pendingCommittedClearRef.current = false
  currentPhaseRef.current = null
  activeTurnIdRef.current = null
  firstChunkRecordedRef.current = false
  log.info('AI generation aborted by user')
}, [])
```

---

### 9.4 [HIGH] #4: clearResponse で新 state 未リセット

**問題**: `clearResponse`（L261-266）にも新 state のリセットが欠落。

**修正**:

```typescript
const clearResponse = useCallback(() => {
  setResponse(null)
  setStreamingText('')
  setError(null)
  setCurrentPhase(null)
  // ★追加: 新 state/ref のリセット
  setCommittedStreamingText('')
  setCommittedResponse(null)
  currentPhaseRef.current = null
}, [])
```

---

### 9.5 [HIGH] #5: discardCommittedResult のクロージャ脆弱性

**問題**: `discardCommittedResult` が `useCallback` の依存配列で `streamingText` をキャプチャしている。
React の batch update により、呼び出し時点の `streamingText` が stale になる可能性がある。

**修正**: `speculativeTextRef`（InterviewContext で管理）を使用する設計に変更。

useAIResponse.ts 側:
```typescript
// ★修正: speculativeTextRef を引数として受け取る
const discardCommittedResult = useCallback((speculativeText: string) => {
  setResponse({ answer: speculativeText, suggestions: [], confidence: 0.8 })
  setCommittedStreamingText('')
  setCommittedResponse(null)
  setCurrentPhase(null)
  currentPhaseRef.current = null
}, [])  // 依存配列が空に → 関数の再生成なし
```

InterviewContext.tsx 側:
```typescript
// W-01 内での呼び出し
if (result.adopted) {
  discardCommittedResult(specText)  // speculativeTextRef.current を渡す
  setAdoptionState('adopted')
}
```

**インターフェース更新**:
```typescript
discardCommittedResult: (speculativeText: string) => void
```

---

### 9.6 [MEDIUM] #6: adoptionState リセットの余分な再レンダリング

**問題**: セクション 4.2.4 で `adoptionState` を speculativeTextRef 同期 effect の依存配列に含めると、
`setAdoptionState('none')` 呼び出し時に effect が再実行され不要な再レンダリングが発生する。

**修正**: 2つの effect に分離:

```typescript
// Effect 1: speculativeTextRef 同期（変更なし）
useEffect(() => {
  if (currentPhase === 'speculative') {
    speculativeTextRef.current = streamingText
  }
}, [currentPhase, streamingText])

// Effect 2: adoptionState リセット（新規・独立）
useEffect(() => {
  if (currentPhase === 'speculative') {
    setAdoptionState('none')
  }
}, [currentPhase])  // streamingText 変更ではトリガーしない
```

---

### 9.7 [MEDIUM] #7: W-01 の useEffect 依存配列不足

**問題**: W-01 useEffect 内で呼び出す `applyCommittedResult` と `discardCommittedResult` が
依存配列に含まれていない。

**修正**: セクション 4.2.3 の依存配列を完全に記載:

```typescript
}, [
  isGenerating,
  committedResponse,
  committedStreamingText,
  latencyMetrics,
  pendingCommittedTurnIdRef,
  turnCount,
  triggerSummarize,
  applyCommittedResult,      // ★追加
  discardCommittedResult,    // ★追加
])
```

**注**: #5 の修正により `discardCommittedResult` の依存配列が空になるため、
関数の再生成頻度は低く、パフォーマンスへの影響は最小限。

---

### 9.8 [MEDIUM] #8: フェードアニメーションのタイミング不一致

**問題**: CSS `transition-all duration-300`（300ms）と JS `setTimeout(150)`（150ms）が不一致。
opacity=0 に切り替えた後、CSS トランジション完了前に opacity=1 に戻ってしまう。

**修正**: 3段階設計に変更:

```typescript
useEffect(() => {
  if (prevAdoptionStateRef.current !== adoptionState && adoptionState === 'replaced') {
    // Step 1: フェードアウト開始
    setIsFading(true)

    // Step 2: フェードアウト完了後（300ms）にフェードイン開始
    const timer = setTimeout(() => setIsFading(false), 300)
    return () => clearTimeout(timer)
  }
  prevAdoptionStateRef.current = adoptionState
}, [adoptionState])
```

CSS も `transition-opacity` に限定（`transition-all` だとレイアウト変化もアニメーションされてしまう）:

```typescript
className={[
  'chat-bubble text-[13px] leading-relaxed min-h-0 font-medium whitespace-pre-wrap transition-all duration-300',
  isSpeculative
    ? 'bg-accent/5 text-content/50 italic'
    : 'bg-accent/10 text-content',
  'transition-opacity duration-300',  // ★修正: opacity用の独立トランジション
  isFading ? 'opacity-0' : 'opacity-100',
].join(' ')}
```

---

### 9.9 [LOW] #9: useMemo 依存配列に adoptionState 漏れ

**問題**: InterviewContext.tsx の `useMemo`（L258-264）で `adoptionState` を
`InterviewContextValue` に含めるが、依存配列に追加していない。

**修正**: セクション 4.2.5 に依存配列の更新を明記:

```typescript
const value = useMemo<InterviewContextValue>(
  () => ({
    // ... 既存フィールド
    adoptionState,  // ★追加
  }),
  [
    // ... 既存依存
    adoptionState,  // ★追加
  ],
)
```

---

### 9.10 [LOW] #10: 'transitioning' PhaseIndicator がデッドコード

**問題**: `AIPhase` 型は `'speculative' | 'committed' | 'detailed'` であり、
`'transitioning'` は含まれない。AIResponsePanel.tsx:39 の分岐は到達不能。

**検証結果**: `transitioning` で grep した結果、AIResponsePanel.tsx:39 の1箇所のみ。
`setCurrentPhase('transitioning')` を呼ぶコードは存在しない。**既存のデッドコード**。

**修正**: 今回の改善で削除する:

```typescript
// ★削除: 'transitioning' 分岐を除去
// if (phase === 'transitioning') { ... }  ← 到達不能なので削除
```

---

### 9.11 [LOW] #11: executeStreamGeneration エラーブランチでも Speculative 保持が必要

**問題**: `executeStreamGeneration` の失敗ブランチ（L173-180, L181-190）で
`setStreamingText('')` が呼ばれるため、Committed 失敗時にも Speculative が消失する。

**根拠**:
```typescript
// L173-176（result.success === false）
setError(result.error || 'Failed to generate response')
setStreamingText('')  // ← Committed 失敗時に Speculative 消失

// L184-185（catch ブランチ）
setError(errorMessage)
setStreamingText('')  // ← 同上
```

**修正**: #2 と同様に phase-aware に変更:

```typescript
// result.success === false ブランチ
} else {
  if (result.error === 'aborted') return
  setError(result.error || 'Failed to generate response')
  if (currentPhaseRef.current === 'committed') {
    // ★修正: Committed失敗時は Speculative を保持
    setCommittedStreamingText('')
    setCommittedResponse(null)
  } else {
    setStreamingText('')
  }
  setIsGenerating(false)
  setCurrentPhase(null)
  currentPhaseRef.current = null
  activeTurnIdRef.current = null
  firstChunkRecordedRef.current = false
}

// catch ブランチ
} catch (err) {
  if (generationIdRef.current !== thisGeneration) return
  const errorMessage = err instanceof Error ? err.message : 'Unknown error'
  setError(errorMessage)
  if (currentPhaseRef.current === 'committed') {
    setCommittedStreamingText('')
    setCommittedResponse(null)
  } else {
    setStreamingText('')
  }
  log.error(`${label} error`, { error: errorMessage })
  setIsGenerating(false)
  setCurrentPhase(null)
  currentPhaseRef.current = null
  activeTurnIdRef.current = null
  firstChunkRecordedRef.current = false
}
```

---

## 10. Rev.2 修正後の変更量サマリー

| ファイル | 行数（概算） | 変更種別 |
|----------|-------------|---------|
| `useAIResponse.ts` | +110行, ~35行修正 | state追加、onChunk振り分け、phase-aware エラー処理、abort/clear拡張、関数追加 |
| `InterviewContext.tsx` | +35行, ~15行修正 | 新state、W-01拡張、effect分離、useMemo依存更新 |
| `AIResponsePanel.tsx` | +25行, ~10行修正 | フェード（タイミング修正）、PhaseIndicator、デッドコード削除 |
| `useProgressiveAI.ts` | 0行 | 変更なし |
| **合計** | **+170行, ~60行修正** | |
