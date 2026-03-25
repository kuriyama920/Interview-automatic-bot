# Phase 3 詳細実行計画

> 作成日: 2026-03-26
> 前提: Phase 1-2 コード実装完了、ベースライン計測完了（C-2, C-7）
> ベースライン: TTFT p50: 1,781ms / p95: 3,625ms / Speculative採用率: 0%

---

## 調査結果サマリー（重要）

Serena + Context7 による調査の結果、**ドキュメント上「未着手」とされている複数タスクが既にコード実装済み**であることが判明。

| タスク | ドキュメント上 | 実際の状態 | 詳細 |
|--------|-------------|-----------|------|
| **F-9** | ❌未着手 | **✅実装済み** | `profile-cache.ts` が存在し `ai.ts` L20,L141 で使用中 |
| **F-6** | ❌未着手 | **✅実装済み** | `documents.ts` DELETE ハンドラーで `invalidateEmbeddingCacheBatch()` 呼び出し済み |
| **I-3** | ❌未着手 | **✅適用済み** | Supabase マイグレーション `20260322174950_iterative_scan` 適用確認済み（MCP経由 2026-03-26） |
| **F-2a** | ❌未着手 | **✅実装済み** | `SpeculativeCache` クラスが `useProgressiveAI.ts` L14,L77,L132,L155 で統合済み |
| **F-2c** | ❌未着手 | **✅実装済み** | `AdaptiveThreshold` クラスが `InterviewContext.tsx` L9,L141,L158,L163 で統合済み |
| **F-10** | ❌未着手 | **⚠️部分実装** | `usage-cache.ts` で「拒否」結果のみキャッシュ済み。「許可」結果のキャッシュは未実装 |
| **F-1** | ❌未着手 | **❌未着手** | プロンプト最適化は未実施 |

---

## 実行タスク一覧（優先順）

### ~~Task 1: I-3 — pgvector iterative scan 適用~~ ✅完了

**Supabase MCP で確認済み（2026-03-26）:**
- マイグレーション `20260322174950_iterative_scan` が適用済み
- `match_documents_with_info` 関数本体に `SET LOCAL hnsw.iterative_scan = 'relaxed_order'` + `max_scan_tuples = 20000` が反映済み

---

### Task 2: F-10 — Worker側使用量チェック「許可」キャッシュ ⚡最大効果

**ステータス:** 「拒否」キャッシュは実装済み（`usage-cache.ts`）。「許可」キャッシュは未実装
**効果:** -50〜200ms/ターン（Worker処理: 150-350ms → 50-150ms）
**工数:** 半日

**現状分析:**

```
apps/worker/src/lib/usage-cache.ts
├── isUsageDenied()         — 拒否キャッシュ読み取り ✅
├── cacheDeniedResult()     — 拒否キャッシュ書き込み（30秒TTL）✅
├── clearDeniedCache()      — 拒否キャッシュクリア ✅
└── (許可キャッシュ)        — ❌未実装

apps/worker/src/lib/usage.ts
├── checkUsageLimit()       — documents用。profilesテーブル + subscription_plans + documents COUNT
├── checkAndReserveUsage()  — stt/ai_tokens用。RPC呼び出し（check_and_reserve_usage）
└── 両方とも毎回DB問い合わせ
```

**実装方針:**

```typescript
// usage-cache.ts に追加
export async function isUsageAllowed(
  userId: string,
  resourceType: ResourceType
): Promise<UsageLimitResult | null>

export async function cacheAllowedResult(
  userId: string,
  resourceType: ResourceType,
  result: UsageLimitResult,
  ctx?: ExecutionContext
): Promise<void>
```

**変更ファイル:**
| ファイル | 変更内容 |
|---------|---------|
| `apps/worker/src/lib/usage-cache.ts` | `isUsageAllowed()`, `cacheAllowedResult()` 追加（CF Cache API, 60秒TTL） |
| `apps/worker/src/lib/usage.ts` | `checkAndReserveUsage()` 冒頭で `isUsageAllowed()` チェック追加 |
| `apps/worker/tests/lib/usage-cache.test.ts` | 許可キャッシュのテスト追加 |
| `apps/worker/tests/lib/usage.test.ts` | キャッシュヒット時のテスト追加 |

**CF Workers Cache API パターン（公式準拠）:**

```typescript
// Cloudflare Workers 公式パターン
const cache = caches.default
const cacheKey = new Request(`https://cache.internal/usage-allowed/${userId}/${resourceType}`)

// 読み取り
const cached = await cache.match(cacheKey)
if (cached) return cached.json()

// 書き込み（s-maxage で TTL 制御）
ctx.waitUntil(
  cache.put(cacheKey, new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=60',  // 1分TTL
    },
  }))
)
```

**安全性考慮:**
- 「許可」結果のみキャッシュ（「拒否」は既存のキャッシュを使用）
- TTL 60秒: 面接中の連続ターンでは十分、使用量超過時は最大60秒で反映
- `reserveAmount > 0` の場合はキャッシュをスキップ（予約量が正確である必要があるため）
- → **質問:** `checkAndReserveUsage` で `reserveAmount > 0` の場合もキャッシュして良いか？（予約はDB側のRPCで行われるため、キャッシュすると二重予約の可能性）

---

### Task 3: F-1 — プロンプト最適化

**ステータス:** 未着手
**効果:** -50〜100ms/ターン（入力トークン数削減 → OpenAI TTFT改善）
**工数:** 半日

**現状分析:**

```
SYSTEM_PROMPT（Committed Lane用）: 約370文字（日本語）≈ 250-350トークン
SPECULATIVE_SYSTEM_PROMPT: 約80文字 ≈ 50-80トークン
```

※ 日本語は1文字≈0.7-1.0トークン（GPTトークナイザ依存）

**最適化方針:**
- SYSTEM_PROMPT の冗長な説明を圧縮（意味を保ちつつ文字数削減）
- 「## 話し方のルール」「## 大事なこと」「## コンテキストの使い方」の3セクションを統合・簡潔化
- 目標: 370文字 → 250文字（30%削減）

**変更ファイル:**
| ファイル | 変更内容 |
|---------|---------|
| `apps/worker/src/lib/prompts.ts` | `SYSTEM_PROMPT` の文字数最適化 |
| `apps/worker/tests/routes/questions-generate.test.ts` | プロンプト変更に伴うスナップショット更新（必要な場合） |

**リスク:**
- プロンプト変更は回答品質に直結するため、A/Bテストが理想的
- → **質問:** プロンプト変更後に品質確認のための面接セッション実施は可能か？

---

### Task 4: LATENCY_OPTIMIZATION_PLAN.md 更新

**ステータス:** 未実施
**効果:** ドキュメント整合性の回復
**工数:** 15分

**変更内容:**
- F-9, F-6, F-2a, F-2c を ✅完了 に更新
- I-3 を「マイグレーション未適用」に更新
- F-10 を「拒否キャッシュのみ実装済み」に更新
- R-1 の記述を最新コードと整合

---

## 実装不要と判明したタスク

### F-9: Worker側プロフィール取得キャッシュ ✅既に完了

**根拠:**
- `apps/worker/src/lib/profile-cache.ts` が存在
- `getCachedProfile()` が CF Cache API を使用（TTL: `PROFILE_CACHE_TTL_SEC`）
- `apps/worker/src/routes/ai.ts` L20 で import、L141（v2 committed）・L289（v1）で使用
- キャッシュミス時のみ Supabase に問い合わせ、`ctx.waitUntil()` でバックグラウンド書き込み

### F-6: RAGキャッシュ無効化機構 ✅既に完了

**根拠:**
- `apps/worker/src/routes/documents.ts` DELETE ハンドラー（L213-219）で：
  1. 削除前にチャンクの `content` を取得
  2. `invalidateEmbeddingCacheBatch(chunkContents)` を `ctx.waitUntil()` で実行
- `apps/worker/src/lib/embedding-cache.ts` に `invalidateEmbeddingCache()` と `invalidateEmbeddingCacheBatch()` が実装済み
- ドキュメント更新（PUT/PATCH）は現在未実装（新規作成 → 削除 → 再作成のフロー）

### F-2a: Speculative結果キャッシュ ✅既に完了

**根拠:**
- `src/renderer/src/utils/speculative-cache.ts` に `SpeculativeCache` クラス（LRU, 5分TTL, bigram類似度検索）
- `useProgressiveAI.ts` L14 で import、L77 で `useRef(new SpeculativeCache())` 初期化
- L132: interim 受信時に `speculativeCacheRef.current.findSimilar(text, 0.8)` でキャッシュ検索
- L155: speculative 完了時に `speculativeCacheRef.current.set(text, resultText)` でキャッシュ保存

### F-2c: 採用率ベース閾値調整 ✅既に完了

**根拠:**
- `src/renderer/src/utils/adaptive-threshold.ts` に `AdaptiveThreshold` クラス
- 直近20ターンの採用率に応じて閾値を自動調整:
  - 採用率 >70%: 0.4 に緩和
  - 採用率 <30%: 0.2 に厳格化
  - 中間: 0.3 維持
- `InterviewContext.tsx` L9 で import、L141 で初期化、L158 で `getThreshold()` 使用、L163 で `recordAdoption()` 記録

---

## 確認事項（ヒアリング）

### Q1: I-3 マイグレーション適用
`supabase/migrations/20260323000000_iterative_scan.sql` は Supabase に適用済みですか？
未適用の場合、Supabase SQL Editor で実行する必要があります。

### Q2: F-10 使用量「許可」キャッシュの安全性
`checkAndReserveUsage` は `reserveAmount` でトークンを予約します。
「許可」結果をキャッシュすると、予約量の二重カウントが起きる可能性があります。
→ **方針案:** `reserveAmount === 0` の純粋なチェック（`checkUsageLimit`）のみキャッシュし、予約付き（`checkAndReserveUsage`）はキャッシュしない
→ これで問題ないですか？

### Q3: F-1 プロンプト変更の品質確認
プロンプトを最適化した後、回答品質を確認するための面接セッション（10ターン程度）を実施できますか？

### Q4: C-3 計測のタイミング
Phase 3 タスク実装後に C-3（Phase適用後TTFT計測）を実施しますか？
それとも F-10 実装後すぐに中間計測を行いますか？

---

## タイムライン

| 順序 | タスク | 担当 | 工数 | 依存 |
|------|--------|------|------|------|
| 1 | Task 4: ドキュメント更新 | Claude | 15分 | なし |
| 2 | Task 1: I-3 マイグレーション適用 | 人間 | 10分 | Q1確認後 |
| 3 | Task 2: F-10 許可キャッシュ | Claude | 半日 | Q2確認後 |
| 4 | Task 3: F-1 プロンプト最適化 | Claude | 半日 | Q3確認後 |
| 5 | C-3: 改善後TTFT計測 | 人間 | 2時間 | Task 2,3 完了後 |

**期待される改善:**
- F-10: TTFT -50〜200ms（Worker処理時間短縮）
- F-1: TTFT -50〜100ms（OpenAI推論開始短縮）
- 合計: TTFT p50 **1,781ms → 1,500-1,700ms** 程度の改善見込み

※ TTFT を目標の1,000ms以下にするには、Speculative採用率の改善（現在0%→50%以上）が本質的に必要。
