# セキュリティレビュー報告書: レイテンシ改善（Phase 0/1/1.5）

**レビュー日:** 2026-03-19
**レビュー対象:** Phase 0（計測基盤）、Phase 1（Quick Wins）、Phase 1.5（Responses API移行）
**レビュアー:** セキュリティレビューエージェント

---

## 総合評価

全体として **概ね良好**。入力バリデーションが体系的に行われており、認証ミドルウェアが全エンドポイントに適用され、エラーメッセージの内部情報漏洩も最小限に抑えられています。

| 重大度 | 件数 |
|--------|------|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 4 |
| LOW | 4 |
| INFO | 3 |

---

## HIGH (1件)

### H-1: AI Gateway baseURL のSSRFリスク

**ファイル:** `apps/worker/src/lib/openai.ts` (行 25-28)

**問題:** `CF_ACCOUNT_ID` と `CF_AI_GATEWAY_ID` を文字列連結で baseURL を構築しており、環境変数が改ざんされた場合（Cloudflareダッシュボードへの不正アクセス、CI/CDパイプラインの汚染等）に任意URLへOpenAI APIキーが転送されるSSRFリスク。

```typescript
const baseURL =
  env?.CF_ACCOUNT_ID && env?.CF_AI_GATEWAY_ID
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY_ID}/openai`
    : undefined
```

**推奨修正:**
```typescript
// CF_ACCOUNT_IDを検証 (Cloudflare Account IDは32桁hex)
const isValidAccountId = /^[a-f0-9]{32}$/.test(env?.CF_ACCOUNT_ID ?? '')
// CF_AI_GATEWAY_IDを検証
const isValidGatewayId = /^[a-z0-9-]{1,64}$/.test(env?.CF_AI_GATEWAY_ID ?? '')
const baseURL =
  isValidAccountId && isValidGatewayId
    ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY_ID}/openai`
    : undefined
```

---

## MEDIUM (4件)

### M-1: X-Turn-Id ヘッダーの入力検証不足

**ファイル:** `apps/worker/src/routes/ai.ts` (行 267)

**問題:** バリデーションなしでSSEメトリクスイベントにエコーバック。ログインジェクションリスク。

```typescript
// 修正案
const rawTurnId = c.req.header('X-Turn-Id') ?? 'unknown'
const turnId = /^[a-f0-9-]{1,64}$/.test(rawTurnId) ? rawTurnId : 'invalid'
```

### M-2: console.debug による内部パフォーマンス情報のログ出力

**ファイル:** `apps/worker/src/routes/ai.ts` (行 300)

**問題:** 本番Cloudflare WorkersログにRAGタイミング情報（prepMs、docContextLen等）が出力される。

**推奨:** 環境変数フラグによるログレベル制御、または本番ビルドでのdebug抑制。

### M-3: localStorage へのサーバー側タイムスタンプ永続化

**ファイル:** `src/renderer/src/hooks/useLatencyMetrics.ts` (行 34, 50-63)

**問題:** サーバー側タイムスタンプ（m4-m9）がlocalStorageに永続化される。XSS発生時に内部パフォーマンス特性が漏洩するリスク。

**推奨:** サーバー側タイムスタンプは差分のみ保存（絶対時刻は除外）、または本番ビルドでは永続化無効化。

### M-4: Bigramキャッシュのキー長無制限

**ファイル:** `src/renderer/src/hooks/useQuestionCache.ts` (行 57)

**問題:** `bigramCache.set(text, bigrams)` でキー文字列長に制限なし。200エントリ × 長文 = 数百MBのメモリ消費リスク。

**推奨:** `getCachedBigrams` でキーを切り詰める（例: 最初の500文字のみ使用）。

---

## LOW (4件)

### L-1: withSoftDeadline の元Promiseリーク

**ファイル:** `apps/worker/src/lib/latency-budget.ts`

Cloudflare Workersのリクエスト寿命内で完了するため実害は限定的。AbortControllerの活用を将来的に検討。

### L-2: previousResponseId のバリデーション（適切）

**ファイル:** `apps/worker/src/routes/ai.ts` (行 122-128)

正規表現 `/^resp_[a-zA-Z0-9_-]+$/` と長さ制限（200文字）で適切にバリデーション済み。OpenAI実際のID形式と一致確認を推奨。

### L-3: turnId のクライアント側生成

**ファイル:** `src/renderer/src/hooks/useProgressiveAI.ts` (行 203)

メトリクス追跡のみで認証に関与しないため実害なし。悪意あるクライアントによるログ汚染のみリスク（M-1と関連）。

### L-4: handleOpenAIError でのエラーメッセージ転送

**ファイル:** `apps/worker/src/lib/openai.ts` (行 47)

`error.message` を直接転送しているが、呼び出し元で汎用メッセージに変換済みのため実害なし。フォールバックメッセージから `error.message` を除去して統一を推奨。

---

## 肯定的な評価点（良い実装）

1. **認証の一貫性**: 全AIエンドポイントに `authRequired` ミドルウェア適用
2. **入力バリデーション**: 全フィールドに型チェック・長さ制限・ホワイトリスト検証
3. **モデルホワイトリスト**: `ALLOWED_MODELS` 配列でモデル名を制御
4. **エラーメッセージのサニタイズ**: 内部エラーをユーザーフレンドリーなメッセージに変換
5. **使用量制御**: 予約→実消費の二段階方式で競合状態での過剰消費を防止
6. **JWT検証**: `timingSafeEqual` によるタイミングセーフ比較
7. **SSEパーサーの堅牢性**: バッファオーバーフロー防止・タイムアウト・JSON解析エラーのグレースフルハンドリング
8. **RAGデータ分離**: 両クエリで `user_id` フィルタ適用
9. **キャッシュサイズ制限**: Bigramキャッシュ（200件）、メトリクス履歴（100件）に上限設定

---

## 優先対応推奨

| 優先度 | ID | 概要 | 対応工数 |
|--------|-----|------|----------|
| 1 | H-1 | AI Gateway baseURL のSSRF防御（環境変数値の検証追加） | 小（10行程度） |
| 2 | M-1 | X-Turn-Id ヘッダーのUUID形式バリデーション追加 | 小（3行程度） |
| 3 | M-3 | メトリクス永続化のサーバータイムスタンプ除外 | 中 |
| 4 | M-2 | 本番ログレベルの制御 | 小 |
| 5 | M-4 | Bigramキャッシュのキー長制限 | 小（1行追加） |

**H-1とM-1は本番デプロイ前に対応することを推奨。**
