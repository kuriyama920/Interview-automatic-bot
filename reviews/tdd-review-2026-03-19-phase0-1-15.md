# Phase 0/1/1.5 テスト状況評価レポート

**レビュー日:** 2026-03-19
**レビュアー:** TDDエージェント

## カバレッジ達成状況

| ファイル | 行カバレッジ | ブランチ | 80%目標 |
|---------|------------|---------|--------|
| `useLatencyMetrics.ts` | 100% | 95.83% | ✅ 達成 |
| `useProgressiveAI.ts` | 94.52% | 81.03% | ✅ 達成 |
| `useQuestionCache.ts` | 92.85% | 88.63% | ✅ 達成 |
| `ai.service.ts` | 97.60% | 90.19% | ✅ 達成 |
| `latency-budget.ts` | 100% | 100% | ✅ 達成 |
| `openai.ts` | **22.05%** | 83.33% | ❌ **未達成** |
| `ai.ts` (routes) | **62.57%** | 52.83% | ❌ **未達成** |

## 主要な発見

### CRITICAL: openai.ts テストが完全に不足

- `generateEmbedding` 関数のテストが一切ない
- `generateEmbeddings` 関数のテストが一切ない
- `handleOpenAIError` のエラー変換テストが一切ない

### HIGH: ai.ts routes カバレッジ不足（62.57%）

- RAGソフトデッドライン超過時の `m6_timedOut: true` シミュレーションなし
- summarize/embeddings/prefetch-context の正常系テストが不十分
- OpenAIエラー時のSSEエラーメッセージテストなし

## 追加すべきテスト（優先度順）

### CRITICAL
1. `openai.test.ts` に `generateEmbedding` テスト（正常系・異常系）
2. `openai.test.ts` に `generateEmbeddings` テスト（バッチ処理含む）
3. `openai.test.ts` に `handleOpenAIError` テスト
4. `openai.test.ts` に `createOpenAIClient` の timeout パラメータテスト

### HIGH
5. `ai.test.ts` に RAGソフトデッドライン超過シミュレーション
6. `ai.test.ts` に `includeDocumentContext: false` 時のRAGスキップ
7. `ai.service.test.ts` に SSE read timeout テスト
8. `useQuestionCache.test.ts` に `findPartialMatch` 正常マッチテスト

### 強み（良い実装）
- `withSoftDeadline` は fake timers による精密テスト ✅
- turnId 伝搬がクライアント→Worker→SSE metrics の全経路でテスト済み ✅
- Bigram FIFO eviction が正確にテスト済み ✅
- `ai.service.ts` が97.6%の高カバレッジ ✅
