# Phase 0/1/1.5 レイテンシ改善実装 — コードレビューレポート

**レビュー日:** 2026-03-19
**レビュー対象:** Phase 0（計測基盤）、Phase 1（Quick Wins）、Phase 1.5（Responses API移行）
**レビュアー:** コードレビューエージェント

## 判定: WARNING — CRITICAL 1件、HIGH 2件、MEDIUM 6件、LOW 4件

---

## CRITICAL (1件)

### C-1: `persistMetrics` のメインスレッドブロッキング

**ファイル:** `src/renderer/src/hooks/useLatencyMetrics.ts:75`

`finalize()` が毎回 `localStorage` から全件読み込み → 追記 → 書き戻しを行い、100件のレコードが溜まるとJSONパース + シリアライズ + I/Oがメインスレッドをブロックする。リアルタイム音声処理中に発生するため重大。

**修正案:**
```typescript
// persistMetrics をデバウンス化
let pendingPersist: LatencyMetrics[] = []
let persistTimer: ReturnType<typeof setTimeout> | null = null

export function persistMetrics(metrics: LatencyMetrics): void {
  pendingPersist.push(metrics)
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    const existing = loadPersistedMetrics()
    const updated = [...existing, ...pendingPersist]
    const trimmed = updated.length > MAX_METRICS_HISTORY
      ? updated.slice(updated.length - MAX_METRICS_HISTORY) : updated
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    pendingPersist = []
    persistTimer = null
  }, 1000)
}
```

---

## HIGH (2件)

### H-1: `withSoftDeadline` の setTimeout リーク

**ファイル:** `apps/worker/src/lib/latency-budget.ts:21-24`

`Promise.race` で元の Promise が先に解決しても `setTimeout` がキャンセルされない。

**修正案:**
```typescript
export function withSoftDeadline<T>(promise: Promise<T>, fallback: T, deadlineMs: number): Promise<T> {
  const safe = promise.catch(() => fallback)
  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), deadlineMs)
  })
  return Promise.race([safe, deadline]).finally(() => clearTimeout(timer))
}
```

### H-2: `generateStreamResponse` の引数が8個（APIデザイン）

**ファイル:** `src/services/ai.service.ts:93-101`

パラメータが8個あり、テストでも `undefined, undefined, undefined, undefined, undefined, undefined, (metrics) => ...` のパターンが頻出。新規コールバック追加のたびにシグネチャが壊れる。

**修正案:** オプション引数をオブジェクトにまとめる（次のリファクタリングフェーズで対応推奨）。

---

## MEDIUM (6件)

### M-1: Worker 内の `console.debug` 残存（本番ログへの内部情報露出）
**ファイル:** `apps/worker/src/routes/ai.ts:300`
300行目の `[perf]` デバッグログが本番 Cloudflare Workers ログに出力される。環境変数フラグで制御するかSSEメトリクスに統合する。

### M-2: `bigramCache` のログアウト時クリア漏れ（データリーク）
**ファイル:** `src/renderer/src/hooks/useQuestionCache.ts:175`
`clearCache()` でユーザーのQ&Aはクリアされるが `bigramCache`（モジュールレベルMap）がクリアされない。別ユーザーでログインした際に前ユーザーのビグラムキャッシュが残る。
```typescript
const clearCache = useCallback(() => {
  cacheRef.current = []
  loadedRef.current = false
  clearBigramCache()  // ← これを追加
  log.info('Question cache cleared')
}, [])
```

### M-3: RAG タイムアウト判定が不正確
**ファイル:** `apps/worker/src/routes/ai.ts:297-298`
`m6_ragTimedOut` は `Promise.all` 全体の完了時間（RAG + profile）で判定しており、profileが遅い場合にRAGが400ms以内でも `true` になる誤判定がある。

### M-4: `GenerateOptions` 型が `env.d.ts` と `ai.service.ts` で不一致
**ファイル:** `src/renderer/src/env.d.ts` vs `src/services/ai.service.ts`
`previousResponseId` と `storeEnabled` が `env.d.ts` に存在しない。`InternalGenerateOptions extends GenerateOptions` に分離するか両方に追加する。

### M-5: `generateEmbedding` が AI Gateway を経由しない
**ファイル:** `apps/worker/src/lib/openai.ts:62`
`createOpenAIClient` を使わず `new OpenAI({ apiKey })` を直接使用しているため、EmbeddingリクエストがAI Gatewayのキャッシュ・レート制限の恩恵を受けない。

### M-6: `FINAL_ACCUMULATE_MS` 200ms の実機検証未実施
**ファイル:** `src/renderer/src/hooks/useProgressiveAI.ts:20`
日本語STTでは文末の助詞が遅延到着するケースがあり、200msでは短すぎる可能性。Phase 0の計測基盤稼働後にA/Bテストで最適値を確認する。

---

## LOW (4件)

| # | ファイル | 問題 |
|---|--------|------|
| L-1 | `analyze-latency.ts` vs `useLatencyMetrics.ts` | `LatencyMetrics` 型が2箇所に重複定義（`phase` の型が異なる） |
| L-2 | `ai.ts:126` | `previousResponseId` 正規表現が将来のOpenAI形式変更に脆弱（現状は許容範囲） |
| L-3 | `useAIStreamReducer.ts:127-132` | ABORT `scope: 'committed'` 時に `phase` が更新されない（UI状態不整合の可能性） |
| L-4 | `session.service.ts` | `previousResponseId` がメモリのみ保持（クラッシュ時に失われるが通常フローでは問題なし） |

---

## テストカバレッジ評価

| ファイル | テスト数 | カバレッジ推定 | 判定 |
|---------|---------|--------------|------|
| `latency-budget.ts` | 5 | 95%+ | OK |
| `openai.ts` | 8 | 85%+ | OK |
| `ai.ts` (routes) | 18 | 80%+ | OK |
| `useLatencyMetrics.ts` | 22 | 95%+ | OK |
| `useQuestionCache.ts` | 18 | 90%+ | OK |
| `useProgressiveAI.ts` | 15 | 85%+ | OK |
| `ai.service.ts` | 28 | 90%+ | OK |
| `analyze-latency.ts` | 11 | 90%+ | OK |

**総合: 80%以上達成。** 不足テスト: `withSoftDeadline` タイマーリーク検証、RAGタイムアウト実発生時のストリーム完了、ABORT `scope: 'committed'` 後の状態整合性。

---

## `withSoftDeadline` 実装の正確性評価 ✅

- 正常完了 < deadline: 元の値が返る — OK
- 正常完了 > deadline: fallback が返る — OK
- reject < deadline: `.catch(() => fallback)` で吸収 — OK
- reject > deadline: deadline が先に解決、後の reject も吸収 — OK

唯一の問題: H-1 の setTimeout リーク。

## Bigram FIFO キャッシュ実装の正確性評価 ✅

`Map.keys().next().value` はJavaScriptの仕様通り挿入順で最古のキーを返す。Non-null assertionも `size >= BIGRAM_CACHE_MAX_SIZE` のガード下にあり安全。LRUではなくFIFOであることがテストで明示的に検証済み。

---

## 良い実装として確認済み

- RAGソフトデッドライン設計（400msでfallback）
- Responses API `instructions`/`input` 分離によるキャッシュ最適化
- SSEメトリクスイベントが最初のチャンク時のみ送信
- `previousResponseId` の正規表現バリデーション
- エラーメッセージのサニタイズ
- イミュータビリティの全体的な遵守
- fake timerを使ったテスト品質

---

## 修正優先度まとめ

| 優先度 | ID | 概要 | 工数 |
|-------|-----|------|------|
| **マージ前必須** | C-1 | `persistMetrics` デバウンス化 | 30分 |
| **マージ前必須** | H-1 | `withSoftDeadline` の setTimeout リーク修正 | 15分 |
| **マージ前推奨** | M-2 | `clearCache()` に `clearBigramCache()` 追加 | 5分 |
| **マージ前推奨** | M-5 | Embedding を AI Gateway 経由に変更 | 30分 |
| **次スプリント** | H-2 | `generateStreamResponse` 引数オブジェクト化 | 1時間 |
| **次スプリント** | M-1, M-3, M-4 | ログ制御・タイムアウト判定・型統一 | 各15-30分 |
