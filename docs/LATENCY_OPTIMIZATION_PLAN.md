# レイテンシ最適化 実装計画書 v4

> 最終更新: 2026-03-26
> ステータス: Phase 1 完了、Phase 2 コード実装完了、ベースライン計測完了（STT移行は未着手）、Phase 3 未着手（F-2 BigramキャッシュTTLのみ実装済み）
> ソースコード検証: 2026-03-21（Phase 1全9タスク✅、Phase 2全7タスク✅）
> ベースライン計測: 2026-03-26（C-2, C-7 完了 — TTFT p50: 1,781ms, Speculative採用率: 0%）
> 根本原因: Responses API は Predicted Outputs をサポートしない

---

## 現状

### 実測値（2026-03-20 推定値）

```
                    Speculative(gpt-5-nano)   Committed(gpt-4.1-nano)   目標(Phase 2)
First Chunk         ~950ms                    1,125-1,602ms             < 1,000ms
```

### ベースライン実測値（2026-03-26 C-2計測 — 37ターン）

```
TTFT（STT受信→UI描画）:
  p50:  1,781ms
  p95:  3,625ms
  max:  3,625ms
  min:  1,648ms
  全ターン: 1648, 1771, 1781, 1823, 2795, 3625ms

Trigger→UI描画（m12-m2、全35ターン）:
  p50:  1,467ms
  p95:  2,524ms

Speculative採用率: 0%（37ターン中0件採用）
  speculative_too_short（<80文字）: 52%
  change_rate_exceeded（>0.3）:     16%
  pending_committed（修正前データ）: 32%

変化率の実測値: 0.73〜0.89（閾値0.3を大幅に超過）

Worker側メトリクス（m4-m9）: 未記録（SSEメトリクスイベント未送信）
```

### 目標 KPI

| 指標 | ベースライン(実測) | Phase 2 | Phase 3 |
|------|-------------------|---------|---------|
| TTFT p50 | **1,781ms** | **< 1,000ms** | **< 800ms** |
| TTFT p95 | **3,625ms** | **< 1,600ms** | **< 1,200ms** |

Phase 2達成条件: Speculative採用率 > 50%（p50が~950msにジャンプ）

---

## モデル・コスト情報（2026-03-21確認済み）

| モデル | 入力$/1M | 出力$/1M | 推論 | TTFT | 用途 |
|--------|---------|---------|------|------|------|
| gpt-4.1-nano | $0.20 | $0.80 | なし | 670-740ms | 現Committed |
| gpt-5-nano | $0.05 | $0.40 | minimal | ~950ms | 現Speculative |
| **gpt-5.4-nano** | $0.20 | $1.25 | none→high | **~460ms(none)** | Committed候補 |

- 二段生成コスト: +36%/ターン（採用率に応じ実効コストは変動。損益分析の詳細は非公開）
- Predicted Outputs: Responses API未サポート、gpt-5系非対応 → Chat Completions移行メリットなし
- Realtime API: コスト50-100倍 → 見送り

---

## 「実装完了」だが未動作の項目

| 項目 | 実態 | 影響 |
|------|------|------|
| ~~useLatencyMetrics~~ | ✅ InterviewContextに接続済み | ~~計測基盤が動作しない~~ |
| ~~useAIStreamReducer~~ | ✅ 削除済み。D-1はuseProgressiveAI独自管理で実装完了 | ~~Dead code~~ |
| ~~v2 includeDocumentContext~~ | ✅ Committedパスで送信済み | ~~prefetchキャッシュが無駄~~ |
| Speculative採用判定 | 常にCommitted再生成。分岐なし | 二段生成の効果ゼロ |
| ~~warmConnection~~ | ✅ 削除済み（コード・テスト・呼び出し全て） | ~~Dead code~~ |

---

## Phase 1: クリーンアップ + 計測基盤（MUST / Week 1）

> 全ての判断の基礎。計測なしに最適化は不可能。

### Day 1: コード修正（4-5時間）

- [x] **A-17: useLatencyMetrics をコンポーネントに接続** ⚠️最優先（C-2のブロッカー）✅完了
  - `InterviewContext.tsx`で`useLatencyMetrics()`を呼び出し、`useProgressiveAI`に`onMetrics`として渡す配線
  - `useProgressiveAI.ts`内で`onMetrics?.record()`/`onMetrics?.finalize()`を呼び出し済み

- [x] **A-19: v2パスに includeDocumentContext 追加** ✅完了（既存実装確認済み）
  - `useProgressiveAI.ts` L236 に `includeDocumentContext: !hasCachedDocs` 実装済み

- [x] **A-18: useAIStreamReducer の統合判断** ✅完了（削除済み、git履歴から復元可能）
  - D-1はuseProgressiveAI独自管理で実装完了。useAIStreamReducerは不要と判断し削除

- [x] **A-1〜A-11: prediction関連の一括削除** ✅完了（既存実装確認済み）
  - predictedAnswer関連コードは全て削除済み
  - テストも整合性修正済み（ai.service.test.ts, useProgressiveAI.test.tsx）

- [x] **A-12: `findPartialMatch` 関数削除（YAGNI）** ✅完了
  - 本体は既に削除済み。テストからfindPartialMatch参照を削除
  - `useQuestionCache.test.ts`, `useProgressiveAI.test.tsx` の関連テスト修正

- [x] **A-13: `warmConnection()` + `ai:warm` 削除** ✅完了
  - 本体は既に削除済み。`ai.service.test.ts` L936-961のテスト削除
  - `InterviewContext.tsx`の`window.electron.ai.warm()`呼び出し削除
  - `InterviewContext.test.tsx`のwarmテスト置き換え

- [x] **A-15: Responses API コメント矛盾修正** ✅完了
  - `ai.ts`: "Predicted Outputs 非対応..." → "Responses API でストリーミング生成"
  - `useProgressiveAI.ts`: "Predicted Outputs" 参照をコメントから削除
  - `InterviewContext.tsx`: speculativeTextRefコメント修正

- [x] **A-20: gpt-5.4-nano モデル追加**（C-5計測の準備）✅完了
  - `ai.ts` L37: `ALLOWED_MODELS`, `MODELS_WITHOUT_TEMPERATURE`, `MODELS_WITH_REASONING` に追加

- [x] **I-1: Hono 4.12.2 → 4.12.8+** ✅完了（既存実装確認済み）
  - `package.json`で`"hono": "^4.12.8"`設定済み

### Day 2-3: 計測（1日） — ⚠️ユーザー手動操作が必要

> コード・スクリプトは全て実装済み。以下は本番環境での手動実行が必要。

#### 前提手順（C-2〜C-7の前に実施）

1. **C-1 マイグレーション適用**: ✅完了（MCP経由で適用確認済み 2026-03-21）
2. **Worker再デプロイ**: `cd apps/worker && npx wrangler deploy`
3. **Electronアプリをビルド・起動**: `pnpm dev` で開発モード起動

#### 計測タスク

- [x] **C-1: Supabase `match_documents_with_info` RPC 適用** ✅完了（MCP経由で適用確認済み 2026-03-21）
  - Supabaseダッシュボード → SQL Editor → `supabase/migrations/20260319000000_match_documents_with_info.sql` の内容を貼り付けて実行
  - 工数: 30分

- [x] **C-2: ベースライン TTFT p50/p95 計測** ✅完了（2026-03-26）
  - 37ターン計測（2セッション合計）、メトリクスファイル出力済み
  - 結果: TTFT p50: 1,781ms / p95: 3,625ms
  - Worker側メトリクス（m4-m9）は未記録（SSEメトリクスイベント未送信のため preProcTime/openaiTtfb 計算不可）

- [ ] **C-3: Phase 1-2 適用後の TTFT 計測**
  - C-2との比較で改善量を定量化
  - 工数: 2時間

- [ ] **C-4: RAG タイムアウト率の計測**
  - Cloudflareダッシュボード → Workers → Logs で `m6_timedOut` フラグを集計
  - または C-2/C-3 計測中の localStorage メトリクスから `m6_ragTimedOut: true` の割合を確認
  - 工数: 30分

- [ ] **C-5: gpt-5.4-nano (none) の TTFT 計測** ← A-20完了✅
  - gpt-4.1-nano との比較、同一プロンプト10問以上
  - 期待値: TTFT ~460ms vs 670-740ms（30-35%改善）
  - 判定: TTFT p50 30%以上改善 + 品質同等以上 → A-22実施
  - 工数: 1時間

- [x] **C-6: previous_response_id エラー率集計** ← 廃止済み
  - previous_response_id およびリトライロジックは削除済み（store: false 固定化に伴い）

- [x] **C-7: Speculative 採用率の予備調査** ✅完了（2026-03-26）
  - 37ターン記録、採用率 0%
  - 52%が「speculative_too_short」（<80文字）、16%が「change_rate_exceeded」（変化率0.73〜0.89、閾値0.3）
  - 結論: 現閾値では二段生成が完全に無効。文字数・変化率の閾値緩和が必要

---

## Phase 2: Speculative 採用判定 + STT移行（MUST / Week 2）

> Phase 2 KPI達成の鍵。採用率 > 50% が必須。
> STT移行はコスト74%削減 + 日本語精度向上 + セマンティックターン検出で最重要施策の一つ。

- [x] **I-2: SSE実装を直接ReadableStreamに変更** ✅完了
  - `ai-streaming.ts`: `createSSEResponse()` ヘルパー追加（TransformStream + SSEWriter）
  - `ai.ts`: `streamSSE()` → `createSSEResponse()` に全面置換（generate, generate-v2 両方）
  - `Content-Encoding: identity` + `X-Accel-Buffering: no` でCF Workers バッファリング回避

- [x] **D-5: feature flag v1/v2 切替** ✅完了
  - `AIService` クラスにインメモリ v2 障害カウンタ追加（アプリ再起動でリセット）
  - v2で3回連続5xx → 自動v1フォールバック（`isV2Available()`, `resetV2()`）
  - IPC: `ai:isV2Available`, `ai:resetV2` ハンドラー追加
  - preload/env.d.ts: 型定義追加

- [x] **A-22: COMMITTED_MODEL を gpt-5.4-nano に切替** ✅完了
  - `ai.ts`: `COMMITTED_MODEL = 'gpt-5.4-nano'`
  - reasoning_effort: COMMITTED_MODEL → `'none'`, SPECULATIVE_MODEL → `'minimal'`
  - `ipc.ts`: `getPreviousResponseIdForModel('gpt-5.4-nano')` に更新

- [x] **D-1: Speculative → Committed UI 遷移** ✅完了
  - `AIResponsePanel.tsx`: `transitioning` フェーズインジケーター追加（「確認中...」）
  - speculative/committed/transitioning の3フェーズ別スタイリング

- [x] **D-2: Speculative 採用判定ロジック有効化** ✅完了
  - `speculative-adoption.ts`: Levenshtein距離ベース変化率計算（純粋関数）
  - `useProgressiveAI.ts`: Final処理時に採用判定を実行、メトリクス記録
  - デフォルト閾値: changeRate ≤ 0.3（30%）、C-7データで調整予定

- [x] **D-3: 採用率トラッキング** ✅完了
  - `useLatencyMetrics.ts`: `speculative_adopted`, `speculative_changeRate`, `speculative_reason` フィールド追加
  - localStorage永続化で閾値調整の基盤データ蓄積

- [x] **D-4: 品質ガードレール** ✅完了
  - Speculative < 80文字 → 採用しない
  - 回答が2文未満 → 採用しない
  - テキスト変化率 > 0.3 → 採用しない
  - `shouldAdoptSpeculative()` で統合判定

### STT移行: Soniox v4 RT（MUST / Week 2-3）

> コスト74%削減、日本語CER 8.7%（OpenAI 13.8%を大幅上回る）、セマンティックエンドポイント。
> PCM 16kHz 16bit 完全互換のため AudioContext 変更不要。

- [ ] **F-11: Soniox v4 RT 評価 + PoC 実装** ⚠️最重要STTタスク
  - **Deepgram → Soniox 比較:**
    | 項目 | Deepgram Nova-3 (現在) | Soniox v4 RT | 差分 |
    |------|----------------------|-------------|------|
    | コスト | $0.0077/分 | **$0.002/分** | **74%削減** |
    | 日本語精度 | Tier 2 (WER 7-16%) | **CER 8.7%** | **OpenAI 13.8%を上回る** |
    | 音声フォーマット | PCM 16kHz 16bit | **PCM 16kHz 16bit** | **完全互換** |
    | ターン検出 | VAD (utterance_end_ms) | **セマンティックエンドポイント** | **発話意図で判定、誤分割減** |
    | 接続方式 | WebSocket | WebSocket | 同等 |
  - **評価手順（1日）:**
    1. Soniox APIキー取得
    2. WebSocket接続テスト（PCM 16kHz 16bit送信）
    3. 日本語面接音声10サンプルでCER/WER比較
    4. セマンティックエンドポイントのターン検出精度確認
    5. ストリーミングレイテンシ計測
  - **判定基準:** 日本語精度が同等以上 + レイテンシ同等以下 → PoC実装に進む
  - **PoC実装（2-3日）:**
    - `stt.service.ts`: Deepgram → Soniox WebSocket接続差し替え
    - `ipc.ts`: STT IPCハンドラーのイベントマッピング
    - `preload/index.ts`, `env.d.ts`: 型定義更新
    - `apps/worker/src/routes/stt.ts`: トークン生成ロジック変更
    - セマンティックエンドポイント → `FINAL_ACCUMULATE_MS` 短縮 or 廃止の検討
    - feature flag `sttProvider: 'deepgram' | 'soniox'` で切替
    - 3回連続接続失敗時にDeepgramへ自動フォールバック
  - **期待効果:**
    - STTコスト: 74%削減（ユーザー単価などの財務詳細は非公開）
    - セマンティックエンドポイント: VADより賢いターン検出で`FINAL_ACCUMULATE_MS`待機を短縮 → TTFT改善
    - 日本語精度向上: 誤認識によるSpeculative Lane不採用を減少 → 採用率向上
  - 工数合計: 3-4日

---

## Phase 2.5: プライバシー（SHOULD / Week 3）

- [x] **E-1: `store` オプトイン UI** ← 不要化（store: false 固定）
  - store: false 固定により OpenAI にデータ保存しない設計に変更。オプトイン UI は廃止。
  - StoreEnabledToggle コンポーネント、settings.service.ts は削除済み。
- [x] **E-2: プライバシーポリシー更新**
  - store: false固定設計をプライバシーポリシーに反映済み（OpenAI連携、セキュリティ、データ保持期間セクション）
  - Deepgram → Soniox への更新済み
  - 連絡先メールアドレスを interviewautomaticbot92@gmail.com に統一
  - 特定商取引法に基づく表記ページ（/tokushoho）を新設・フッターリンク追加済み

---

## Phase 3: Quick Wins（SHOULD / Week 3）

> 効果が高く工数が小さい施策を先に実施。

- [x] **F-9: Worker側プロフィール取得キャッシュ** ✅完了（ソースコード検証 2026-03-26）
  - `profile-cache.ts`: `getCachedProfile()` が CF Cache API でキャッシュ（TTL設定済み）
  - `ai.ts` L20 で import、L141（v2 committed）・L289（v1）で使用中

- [ ] **F-10: Worker側使用量チェックキャッシュ** — -50~200ms、半日 ⚠️拒否キャッシュのみ実装済み
  - `usage-cache.ts`: 「拒否」結果キャッシュ（30秒TTL）✅実装済み
  - 「許可」結果キャッシュ（1分TTL）❌未実装
  - Worker処理: 150-350ms → 50-150ms

- [ ] **F-1: プロンプト最適化（370文字→250文字目標）** — -50~100ms、半日
  - SYSTEM_PROMPT: 約370文字（日本語）≈ 250-350トークン。目標30%削減

- [x] **F-6: RAGキャッシュ無効化機構** ✅完了（ソースコード検証 2026-03-26）
  - `documents.ts` DELETE ハンドラーで `invalidateEmbeddingCacheBatch(chunkContents)` を `ctx.waitUntil()` で実行
  - `embedding-cache.ts` に `invalidateEmbeddingCache()` と `invalidateEmbeddingCacheBatch()` 実装済み

- [x] **I-3: pgvector iterative scan 導入** ✅完了（Supabase MCP確認 2026-03-26）
  - マイグレーション `20260322174950_iterative_scan` 適用済み
  - `match_documents_with_info` に `SET LOCAL hnsw.iterative_scan = 'relaxed_order'` + `max_scan_tuples = 20000` 反映済み

- [x] **F-2: セッション内キャッシュ強化** ✅完了（ソースコード検証 2026-03-26）
  - ~~Speculative結果キャッシュ（5分TTL）~~ ✅実装済み（`SpeculativeCache` クラス → `useProgressiveAI.ts` L14,L77,L132,L155 で統合）
  - ~~Bigramキャッシュに3分TTL追加~~ ✅実装済み（useQuestionCache.ts L38-62）
  - ~~採用率ベース閾値調整（>70%→緩和、<30%→厳格化）~~ ✅実装済み（`AdaptiveThreshold` → `InterviewContext.tsx` L9,L141,L158,L163 で統合）

---

## Phase 3: Advanced（COULD / Week 4+）

---

## STTパラメータ方針

### 現行（Deepgram） — Soniox移行までの暫定

| パラメータ | 現在 | 方針 | ロールバック条件 |
|-----------|------|------|---------------|
| model | nova-2 | **nova-2維持**（Soniox移行で不要に） | - |
| utterance_end_ms | 1000ms | 維持 | - |
| endpointing | 300ms | 200ms（検証付き） | 誤分割率 >10% → 300msに戻す |
| FINAL_ACCUMULATE_MS | 200ms | 150ms（検証付き） | 日本語分割5%以上不正確 → 200msに戻す |

### Soniox v4 RT 移行後（F-11完了時）

| パラメータ | 変更 | 理由 |
|-----------|------|------|
| utterance_end_ms | **廃止** | セマンティックエンドポイントに置換 |
| endpointing | **廃止** | セマンティックエンドポイントに置換 |
| FINAL_ACCUMULATE_MS | **短縮 or 廃止を検証** | セマンティック判定で誤分割が減ればバッファ不要 |
| 音声フォーマット | 変更なし | PCM 16kHz 16bit 完全互換 |

---

## 技術的決定事項

| 決定 | 根拠 | ステータス |
|------|------|----------|
| Predicted Outputs は使わない | Responses API非対応、gpt-5系非対応 | 確定 |
| Chat Completions 移行不要 | 上記により移行メリット消失 | 確定 |
| gpt-5.4-nano (none) を Committed候補に | SWE-Bench 52.4%、TTFT ~460ms | C-5で判断 |
| gpt-5.4-nano インフラ変更不要 | AI Gateway/キャッシュ互換（previous_response_id は廃止済み） | 確定 |
| Realtime API 見送り | コスト50-100倍、レイテンシも改善しない | 確定 |
| AI Gateway キャッシュ無効 | stream:true はキャッシュ対象外 | 確定 |
| utterance_end_ms 1000ms維持 | Deepgram公式推奨。v2の700ms案撤回 | 確定 |
| nova-3 アップグレード中止 | Soniox v4 RT移行を優先。nova-3は不要 | 確定 |
| Hono 4.12.8+ | TrieRouter高速化+SSE修正。4.12.2インストール済み | 確定 |
| SSE → 直接ReadableStream | CF Workersバッファリング問題（公式+GitHub issue確認） | 確定 |
| warmConnection 削除 | Worker側エンドポイント未実装 | 確定 |
| A-12はA-7に依存 | findPartialMatchはpredictedAnswer経由で使用中 | 確定 |
| **STT移行: Soniox v4 RT を最推奨** | コスト74%削減($0.002/分)、日本語CER 8.7%、PCM互換、セマンティックエンドポイント | **F-11で評価（MUST）** |
| 旧STT候補(Scribe v2 RT/Gladia/Groq)を削除 | Soniox v4 RTが全指標で優位 | 確定 |
| reasoning.effort: 'minimal' はGPT-5系固有値 | OpenAI標準は 'low'/'medium'/'high'/'none'。GPT-5系は 'minimal' を追加サポート。Committed(gpt-5.4-nano)は 'none'、Speculative(gpt-5-nano)は 'minimal' を使用 | 確定 |
| useAIStreamReducer 削除 | D-1はuseProgressiveAI独自管理で完結。git履歴から復元可能 | 確定 |
| ドキュメントgrouping共通化済み | `groupDocumentChunks` + `formatGroupedContext` を `ai-generate.ts` に抽出。fetchDocumentContextInner / prefetch-context で共用 | 確定 |

---

## リファクタリング課題（Phase 3+）

> コードレビューで検出。機能的には問題ないが、保守性向上のため段階的に対応する。

### 中規模（1-2時間）

- [x] **R-1: v1/v2 generate エンドポイント共通化** ✅完了
  - `ai-generate.ts`: `groupDocumentChunks`, `formatGroupedContext`, `deferDbWrite`, `createDbWriteHelpers` を抽出
  - `ai-validation.ts`: `validateGenerateRequest`, `validateSummarizeRequest`, `validateGenerateV2Request`, `validateEmbeddingsRequest` を移動
  - ai.ts: 802行 → 578行（-28%削減）
  - テスト: 462件全合格、カバレッジ 56% → 83.53%

### 大規模（半日〜1日）

- [ ] **R-2: Electron 型定義の共有化**
  - `AIResponse`, `GenerateOptions`, `TranscriptResult` 等がmain/preload/rendererの3箇所で独立定義
  - `src/types/shared.ts` に統合し、全層からimport。Electronプロセス境界を跨ぐビルド設定調整が必要
  - 影響: `ai.service.ts`, `preload/index.ts`, `env.d.ts`, 全テスト
  - 工数: 半日〜1日

---

## 監視項目

| 項目 | 頻度 | アクション |
|------|------|----------|
| Deepgram Flux 日本語版 | 週次 | リリース後 F-5 着手（Q1末時点で未リリース） |
| Responses API Predicted Outputs | 月次 | 対応されたら F-8 再評価 |
| gpt-5.4-nano TTFT/コスト変動 | 月次 | コストへの影響確認 |
| OpenAI 新モデル | 随時 | ALLOWED_MODELS 追加検討 |
| Soniox v4 RT 価格・機能更新 | 月次 | 新機能（話者分離等）の追加、価格改定 |
| Deepgram Voice Agent API | 月次 | $4.50/時間、Realtime APIより低コスト代替 |
