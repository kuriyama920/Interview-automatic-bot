# Phase 1 レイテンシ最適化クリーンアップ — 統合レビュー結果

> 日時: 2026-03-21
> レビュワー: Codex (o3-mini), Claude Code-Reviewer, Claude Security-Reviewer

---

## サマリー

| 重大度 | Codex | Code Review | Security Review | 合計 |
|--------|-------|-------------|-----------------|------|
| CRITICAL | 0 | 0 | 0 | **0** |
| HIGH | 0 | 0 | 0 | **0** |
| MEDIUM | 0 | 3 | 1 | **4** |
| LOW | 2 (誤検出) | 3 | 5 | **8** |

**総合判定: 条件付き承認** — CRITICAL/HIGH指摘なし。MEDIUM指摘の対応推奨。

---

## MEDIUM指摘 (対応推奨)

### M-1: docs/codemaps/frontend.md に findPartialMatch の陳腐化記述

**ソース:** Code Review
**ファイル:** `docs/codemaps/frontend.md:52`
**問題:** 削除済みの `findPartialMatch (>0.4)` がドキュメントに残存
**修正案:**
```diff
- | useQuestionCache | Bigram similarity matching | findMatch (>0.65), findPartialMatch (>0.4) |
+ | useQuestionCache | Bigram similarity matching | findMatch (>0.65) |
```

### M-2: useProgressiveAI.ts L253 の finalize タイミング

**ソース:** Code Review
**ファイル:** `src/renderer/src/hooks/useProgressiveAI.ts:253`
**問題:** `onMetrics?.finalize(turnId)` が生成関数呼び出し直後に同期実行される。生成完了後の m10-m12 メトリクスが記録される前に finalize されるため、`ttft` / `deliveryLatency` 等が `undefined` になる。
**判断:** Phase 1は計測基盤の「配線」が目的。エンドツーエンドの計測精度はPhase 2で改善。意図を明示するコメント追加を推奨。

### M-3: useAIStreamReducer.ts が完全な Dead code

**ソース:** Code Review
**問題:** Phase 2 D-1用に保持しているが、現時点では純粋なDead code。
**判断:** コメントでDead code明記済み。Phase 2計画が具体的なため維持は許容。

### M-4: サーバーログにOpenAIエラー詳細出力

**ソース:** Security Review
**ファイル:** `apps/worker/src/routes/ai.ts:507-512`
**問題:** console.error でOpenAIエラー詳細が記録される。クライアントには漏洩しないが、Cloudflareダッシュボードのアクセス制御を確認すべき。
**判断:** クライアントへの情報漏洩はなし（toUserFacingErrorMessage でサニタイズ済み）。

---

## LOW指摘 (対応任意)

| # | ソース | 問題 | 判断 |
|---|--------|------|------|
| L-1 | Code Review | ai.service.test.ts の predictedAnswer 回帰テスト残存 | 意図的ガード、問題なし |
| L-2 | Code Review | persistMetrics の setTimeout(fn, 0) | requestIdleCallback の方がセマンティック的に適切だが機能的に問題なし |
| L-3 | Code Review | Ref内Map のミューテーション | パフォーマンス理由で許容。値レベルではイミュータブル |
| L-4 | Security | localStorage保存データ | メトリクス数値のみ、機密データなし |
| L-5 | Security | OWASP A09 ログ監視 | console.error/warn記録あり、アラート設定は未確認 |

---

## 整合性チェック結果

| チェック項目 | 結果 |
|---|---|
| warmConnection の完全削除 | OK |
| findPartialMatch の完全削除 | OK (ドキュメント1箇所残存 → M-1) |
| predictedAnswer の完全削除 | OK |
| useLatencyMetrics の接続 | OK |
| テストと実装の一致 | OK |
| イミュータブルパターン | OK |
| 不要なimport/export | OK |

---

## OWASP Top 10 チェック

| # | カテゴリ | 結果 |
|---|---|---|
| A01 | アクセス制御 | PASS |
| A02 | 暗号化 | PASS |
| A03 | インジェクション | PASS |
| A04 | 安全でない設計 | PASS |
| A05 | セキュリティ設定ミス | PASS |
| A07 | 認証の失敗 | PASS |
| A08 | データ整合性 | PASS |
| A09 | ログ・監視 | PASS (LOW) |
| A10 | SSRF | PASS |

---

## 対応アクション

1. **M-1 (必須):** `docs/codemaps/frontend.md` の findPartialMatch 記述削除
2. **M-2 (推奨):** finalize タイミングにコメント追加
3. **M-3:** 現状維持（Phase 2計画あり）
4. **M-4:** Cloudflareダッシュボードのアクセス制御確認（運用タスク）
