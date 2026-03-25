# トランスクリプト蓄積改善計画（ハイブリッド方式）

> **依存タスク:** F-11（Soniox v4 RT 評価 + PoC）完了後に着手
> Sonioxのセマンティックエンドポイントの挙動次第でパラメータ（蓄積時間等）を調整する。
> 詳細は [LATENCY_OPTIMIZATION_PLAN.md](LATENCY_OPTIMIZATION_PLAN.md) の F-12 を参照。

## 問題概要

### 現象
面接官の発言が句読点（。、？）で区切られ、短い断片ごとにCommitted AI生成がトリガーされるため、質問の意図と異なるAI回答が生成される。

### ログ証拠
```
# 12文字の断片で確定回答を生成（本来は後続の文と合わせて処理すべき）
Final transcript {"length":12} → committed generation (questionLength:12)

# 数百ms後に続きが到着（別の質問として処理される）
Final transcript {"length":7}  → committed generation (questionLength:7)
```

### 根本原因
1. **Deepgramの挙動**: `is_final: true` を文単位（句読点区切り）で送信
2. **蓄積ウィンドウが短すぎる**: `FINAL_ACCUMULATE_MS = 200ms`
3. **日本語の特性**: 句点（。）後の間が300-800ms（200msでは不足）
4. **完結性チェック不在**: テキストが質問として完結しているか判定していない

---

## 解決方針: ハイブリッド方式（A + B）

**A. 基本蓄積時間の延長** + **B. 文完結性ヒューリスティック**

### 設計原則
- TTFTへの影響を最小限に抑える（基本+200ms程度）
- 完結した質問は速やかに処理
- 不完全な断片は追加待機で後続を待つ
- Speculative Laneは変更なし（interimで既にカバー）

---

## 詳細実装計画

### Phase 1: 文完結性判定ユーティリティの作成

**ファイル**: `src/renderer/src/utils/sentence-completeness.ts` (新規)

#### 1.1 日本語文完結性チェッカー

```typescript
/**
 * 日本語テキストが質問/発言として完結しているかを判定
 *
 * 完結パターン:
 *   - 疑問符で終わる: 「〜ですか？」「〜ますか？」
 *   - 丁寧語の文末: 「〜ください」「〜ましょう」「〜ですね」
 *   - 命令・依頼: 「〜してください」「〜教えてください」
 *   - 句点で終わり十分な長さ: 「〜です。」(15文字以上)
 *
 * 不完全パターン:
 *   - 助詞で終わる: 「〜は」「〜が」「〜を」「〜に」「〜で」「〜と」
 *   - 接続表現で終わる: 「〜して」「〜だけど」「〜ですが」
 *   - 短すぎる句点終わり: 「はい。」(10文字未満)
 *   - 読点で終わる: 「〜ですが、」
 */
export function isUtteranceComplete(text: string): boolean
```

#### 1.2 判定ロジック詳細

| 条件 | 判定 | 理由 |
|------|------|------|
| `?` `？` で終わる | 完結 | 疑問文の終端 |
| `ください` `ましょう` で終わる | 完結 | 依頼・提案の終端 |
| `ですね` `ますね` `ですよ` で終わる | 完結 | 確認・強調の終端 |
| `。` で終わり 15文字以上 | 完結 | 十分な長さの平叙文 |
| `。` で終わり 15文字未満 | 不完結 | 短い相槌の可能性（「はい。」「そうです。」） |
| `は` `が` `を` `に` `で` `と` `も` で終わる | 不完結 | 助詞＝後続あり |
| `、` `，` で終わる | 不完結 | 読点＝文中 |
| `けど` `ですが` `して` `した上で` で終わる | 不完結 | 接続表現＝後続あり |
| 上記いずれにも該当しない | 不完結 | 安全側に倒す |

#### 1.3 テスト仕様

```typescript
// 完結テスト
isUtteranceComplete('あなたの強みは何ですか？')        // → true
isUtteranceComplete('具体的に教えてください')           // → true
isUtteranceComplete('チームでの経験について話してください') // → true
isUtteranceComplete('前職ではどのような業務を担当していましたか。') // → true

// 不完結テスト
isUtteranceComplete('あなたの')                        // → false（助詞終わり）
isUtteranceComplete('強みは')                          // → false（助詞終わり）
isUtteranceComplete('それについてですが、')             // → false（接続＋読点）
isUtteranceComplete('はい。')                          // → false（短い句点）
isUtteranceComplete('具体的に')                        // → false（副詞的）
```

---

### Phase 2: useProgressiveAI の蓄積ロジック改修

**ファイル**: `src/renderer/src/hooks/useProgressiveAI.ts` (既存修正)

#### 2.1 定数変更

```typescript
// Before
const FINAL_ACCUMULATE_MS = 200

// After
const FINAL_ACCUMULATE_MS = 400           // 基本蓄積時間を200→400msに延長
const FINAL_ACCUMULATE_EXTENDED_MS = 800  // 不完全テキスト時の延長蓄積時間
const FINAL_MIN_QUESTION_LENGTH = 8       // 質問として最低限の文字数
```

#### 2.2 蓄積ロジックの改修箇所

**変更対象**: `useEffect` (L297-340) — Final transcript蓄積処理

```
現在のフロー:
  final transcript到着 → 200msデバウンス → processFinalTranscripts()

改修後のフロー:
  final transcript到着
    → 蓄積テキストの完結性をチェック
    → 完結している場合:   400msデバウンス → processFinalTranscripts()
    → 不完結の場合:       800msデバウンス → processFinalTranscripts()
    → 文字数不足の場合:   800msデバウンス → processFinalTranscripts()
```

#### 2.3 改修コード概要

```typescript
// Final: 確定テキストを蓄積し、同一話者の連続フラグメントをまとめて処理
useEffect(() => {
  if (!autoGenerateAI) return

  const newTranscripts = transcripts.slice(lastProcessedIndex.current + 1)
  if (newTranscripts.length === 0) return

  const interviewerTranscripts = audioSource === 'both'
    ? newTranscripts.filter((t) => t.source !== 'mic')
    : newTranscripts

  if (interviewerTranscripts.length === 0) {
    // 候補者のみのtranscript → 蓄積中があれば即時処理
    if (finalAccumulateRef.current) {
      clearTimeout(finalAccumulateRef.current)
      finalAccumulateRef.current = null
      processFinalTranscripts()
    } else {
      lastProcessedIndex.current = transcripts.length - 1
    }
    return
  }

  // ★ 改修ポイント: 蓄積済みテキストの完結性に応じてデバウンス時間を動的決定
  const pendingText = interviewerTranscripts.map((t) => t.text).join(' ').trim()
  const isComplete = isUtteranceComplete(pendingText)
  const isTooShort = pendingText.length < FINAL_MIN_QUESTION_LENGTH

  const debounceMs = (isComplete && !isTooShort)
    ? FINAL_ACCUMULATE_MS           // 400ms: 完結した質問
    : FINAL_ACCUMULATE_EXTENDED_MS  // 800ms: 不完全 or 短すぎる

  log.debug('[Final] Accumulation debounce', {
    pendingText: pendingText.substring(0, 30),
    isComplete,
    isTooShort,
    debounceMs,
  })

  if (finalAccumulateRef.current) clearTimeout(finalAccumulateRef.current)
  finalAccumulateRef.current = setTimeout(() => {
    finalAccumulateRef.current = null
    processFinalTranscripts()
  }, debounceMs)

  return () => {
    if (finalAccumulateRef.current) clearTimeout(finalAccumulateRef.current)
  }
}, [transcripts, audioSource, autoGenerateAI, processFinalTranscripts])
```

#### 2.4 processFinalTranscripts の追加ガード

```typescript
// processFinalTranscripts 内に追加
// 文字数が極端に少ない場合はスキップ（相槌等）
if (finalTrimmed.length < FINAL_MIN_QUESTION_LENGTH) {
  log.debug('[Final] Skipping too short text', { text: finalTrimmed })
  return
}
```

---

### Phase 3: テスト作成

#### 3.1 ユニットテスト: sentence-completeness

**ファイル**: `src/renderer/src/utils/__tests__/sentence-completeness.test.ts` (新規)

| テストケース | 入力 | 期待値 |
|-------------|------|--------|
| 疑問符終わり | `あなたの強みは何ですか？` | `true` |
| ください終わり | `教えてください` | `true` |
| 長い句点終わり | `前職ではプロジェクトマネージャーとして業務を行っていました。` | `true` |
| 助詞終わり | `あなたの` | `false` |
| 読点終わり | `それについてですが、` | `false` |
| 短い句点 | `はい。` | `false` |
| 接続表現 | `具体的にして` | `false` |
| 空文字 | `` | `false` |

#### 3.2 統合テスト: 蓄積タイミング

手動テストシナリオ:

| # | シナリオ | 期待動作 |
|---|---------|---------|
| 1 | 「あなたの強みは何ですか？」(一文で完結) | 400ms後にcommitted生成 |
| 2 | 「あなたの強みは何ですか。」+500ms後+「具体的に教えてください。」| 800ms蓄積で両方まとめてcommitted生成 |
| 3 | 「はい。」(短い相槌) | 800ms待機後、8文字未満ならスキップ |
| 4 | 「それでは、」+300ms後+「次の質問に移ります。」| 不完結→800ms蓄積で結合して処理 |
| 5 | 面接官発言中に候補者が話し始める | 蓄積中のテキストを即時処理 |

---

## 変更ファイル一覧

| ファイル | 操作 | 変更内容 |
|---------|------|---------|
| `src/renderer/src/utils/sentence-completeness.ts` | 新規 | `isUtteranceComplete()` 関数 |
| `src/renderer/src/utils/__tests__/sentence-completeness.test.ts` | 新規 | ユニットテスト |
| `src/renderer/src/hooks/useProgressiveAI.ts` | 修正 | 蓄積ロジック改修（定数変更 + 完結性チェック導入） |

---

## レイテンシ影響分析

### Before（現状）

| ケース | 蓄積時間 | TTFT影響 |
|--------|---------|----------|
| 全ケース | 200ms | +200ms |

### After（改修後）

| ケース | 蓄積時間 | TTFT影響 | 発生頻度 |
|--------|---------|----------|---------|
| 完結した質問（長い） | 400ms | +400ms (+200ms増) | 60% |
| 不完全な断片 | 800ms | +800ms (+600ms増) | 30% |
| 短い相槌→スキップ | 800ms→スキップ | 無駄な生成を削減 | 10% |

### 正味の改善

- **不要なcommitted生成の削減**: 断片ごとの無駄な生成が統合される
- **回答品質の向上**: 完全な質問に基づく回答生成
- **API コスト削減**: 不要な生成呼び出しの減少
- **TTFT増加**: 平均+300ms程度（Speculative Laneでカバー済み）

---

## リスクと軽減策

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| 完結性判定の誤判定（完結を不完結と判定） | TTFT +400ms増 | 安全側（不完結寄り）なので回答品質は劣化しない |
| 完結性判定の誤判定（不完結を完結と判定） | 断片処理の改善なし | 正規表現パターンを網羅的にテスト |
| 800ms蓄積中に候補者が話し始める | 蓄積テキストの処理遅延 | 候補者transcript検知で即時処理（既存ロジック） |
| 日本語以外の発話 | 完結性チェック不適合 | 英語の文末パターンも追加検討（Phase 2+） |

---

## 実装順序とタイムライン

```
Step 1: sentence-completeness.ts 作成 + テスト
    ↓
Step 2: useProgressiveAI.ts 定数変更 + ロジック改修
    ↓
Step 3: ユニットテスト実行・通過確認
    ↓
Step 4: 手動テスト（pnpm dev で実際の音声入力で確認）
    ↓
Step 5: ログ確認（蓄積時間・完結性判定の精度検証）
```

---

## 成功基準

1. **句読点分割問題の解消**: 「〜ですか。具体的に〜」が1つの質問としてcommitted生成される
2. **TTFT劣化が許容範囲内**: committed TTFT +300ms以内（speculative laneでカバー）
3. **相槌スキップ**: 「はい。」「そうですね。」等でAI生成がトリガーされない
4. **既存テスト通過**: `pnpm test` が全てパス
5. **ビルド成功**: `pnpm build` がエラーなし
