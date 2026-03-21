# Phase 2 包括的コードレビュー

**日付**: 2026-03-21
**レビュー方法**: 5並列レビュー（再利用/品質/効率/セキュリティ/Codex）
**対象**: Phase 1-2 実装（52ファイル、+5281/-876行）

---

## 統合サマリー

| 重大度 | 件数 | 対応 |
|--------|------|------|
| CRITICAL | 1件 | 即座に修正 |
| HIGH (バグ) | 1件 | 即座に修正 |
| HIGH (セキュリティ) | 3件 | 次スプリントで対処 |
| HIGH (品質) | 3件 | リファクタリングで対処 |
| MEDIUM | 14件 | 計画的に対処 |
| LOW | 10件+ | 監視のみ |

---

## CRITICAL

### SEC-01: `wrangler.toml` に `CF_ACCOUNT_ID` がハードコード
- **ファイル**: `apps/worker/wrangler.toml:22-24`
- **対処**: Cloudflare Secrets に移動

---

## HIGH (バグ)

### BUG-01: `shouldAdoptSpeculative(specText, specText)` — 同一テキスト比較バグ
- **ファイル**: `src/renderer/src/hooks/useProgressiveAI.ts:259`
- **影響**: changeRate が常に 0、採用判定が常に true（ガードレール条件を満たす場合）
- **メトリクス `speculative_changeRate` が全て 0 で記録される**
- **対処**: committed テキスト到着前のプレチェックはガードレール（長さ・文数）のみ確認

---

## HIGH (セキュリティ)

### SEC-02: インメモリレート制限がバイパス可能
- **ファイル**: `apps/worker/src/middleware/rate-limit.ts:26`
- **対処**: Cloudflare WAF レート制限追加 + メモリリーク対策（GC追加）

### SEC-03: origin なしリクエストに `*` を返す CORS
- **ファイル**: `apps/worker/src/middleware/cors.ts:17`
- **対処**: originなし時は Worker 自身の URL を返すか、ヘッダー非付与

### SEC-04: Cloudflare Pages プレビューの広範な許可
- **ファイル**: `apps/worker/src/lib/allowed-origins.ts:32`
- **対処**: Pages 設定でプレビュー作成を制限 or 環境変数で制御

---

## HIGH (品質/効率)

### DRY-01: `/generate` と `/generate-v2` の大規模重複（~200行）
- **ファイル**: `apps/worker/src/routes/ai.ts` (259-451行 vs 453-591行)
- **対処**: 共通ヘルパー関数の抽出

### DRY-02: OpenAI エラーハンドリング二系統
- **ファイル**: `openai.ts:42-62` vs `ai-streaming.ts:21-34`
- **対処**: `mapOpenAIErrorToMessage` に統一

### MEM-01: rateLimitStore メモリリーク（無制限成長）
- **ファイル**: `apps/worker/src/middleware/rate-limit.ts`
- **対処**: 古いエントリのパージロジック追加

---

## MEDIUM (主要)

| ID | 問題 | ファイル |
|----|------|----------|
| DRY-03 | ドキュメントグルーピングロジック重複 + labelMap不整合 | ai.ts:189,692 |
| DRY-04 | turnId正規表現の重複 | ai.ts:242,472 |
| DRY-05 | AI使用量上限メッセージが5箇所にハードコード | ai.ts, documents.ts, questions.ts |
| DRY-06 | AIResponse 3重定義, TranscriptResult 4重定義 | env.d.ts, preload, ai.service.ts |
| PERF-01 | streamingTextでContext全consumer再レンダリング | InterviewContext.tsx:209 |
| PERF-02 | /summarize, /embeddings の DB書き込みが直列 | ai.ts:646,777 |
| SEC-05 | プロンプトインジェクション防御不足 | ai.ts:337 |
| SEC-08 | console.error での機密データ出力可能性 | 複数 |
| QUAL-01 | ai.ts 797行で上限接近 | ai.ts |
| QUAL-02 | IPC ai:generateStreamV2 パラメータスプロール | ipc.ts:406 |
| QUAL-03 | useProgressiveAI の ref 過多（13個） | useProgressiveAI.ts |
| QUAL-04 | useLatencyMetrics の record 型安全性不足 | useLatencyMetrics.ts:78 |
| QUAL-05 | GenerateOptions 名前衝突（同名異構造） | env.d.ts vs ai.service.ts |
| DEAD-01 | useAIStreamReducer 未使用（Phase 2 D-1用保持） | useAIStreamReducer.ts |

---

## テストカバレッジ

### Phase 2 新規ファイル: 全て 100% ✅
- ai-streaming.ts, ai-validation.ts, embedding-cache.ts, latency-budget.ts, rate-limit.ts

### Worker 全体: 56.01% ❌ (目標 80%)
- 低カバレッジは既存ファイル（documents.ts 7%, questions.ts 5%, subscription.ts 0%, usage.ts 3%）

### Electron テスト: 全322テスト合格 ✅

---

## 良好なプラクティス（維持すべき）

- タイミングセーフ JWT 検証
- OAuth state の有効期限管理
- IPC チャンネルホワイトリスト
- `createSSEResponse` による CF Workers バッファリング回避
- `session.service.ts` のモデルミスマッチ防止
- `ai-validation.ts` の入力バリデーション抽出
- rate-limit.ts のイミュータブルパターン
- グローバルエラーハンドラーによる内部エラー隠蔽
