# 残タスク実行計画書 v2

> 作成日: 2026-03-22
> 改訂日: 2026-03-23（v3: 実装完了タスク反映）
> 対象: LATENCY_OPTIMIZATION_PLAN.md 未完了タスク全16件
> 根拠: ソースコード実査 + Soniox公式ドキュメント調査 + context7検証に基づく

---

## 目次

1. [Day 0: ホットフィックス（storeEnabled）](#day-0-ホットフィックスstoreenabled)
2. [Phase 2: F-11 Soniox v4 RT 完全移行](#phase-2-f-11-soniox-v4-rt-完全移行)
3. [Phase 2.5: E-1/E-2 プライバシー](#phase-25-e-1e-2-プライバシー)
4. [Phase 3: F-9 プロフィールキャッシュ](#phase-3-f-9-プロフィールキャッシュ)
5. [Phase 3: F-10 使用量チェックキャッシュ](#phase-3-f-10-使用量チェックキャッシュ)
6. [Phase 3: F-1 プロンプト最適化](#phase-3-f-1-プロンプト最適化)
7. [Phase 3: F-6 RAGキャッシュ無効化](#phase-3-f-6-ragキャッシュ無効化)
8. [Phase 3: I-3 pgvector iterative scan](#phase-3-i-3-pgvector-iterative-scan)
9. [Phase 3: F-2 セッション内キャッシュ強化](#phase-3-f-2-セッション内キャッシュ強化)
10. [リファクタリング: R-2 型定義共有化](#リファクタリング-r-2-型定義共有化)
11. [Phase 1 計測タスク: C-2〜C-7](#phase-1-計測タスク-c-2c-7)
12. [優先順位・依存関係マトリクス](#優先順位依存関係マトリクス)
13. [レビュー指摘事項](#レビュー指摘事項)

---

## Day 0: ホットフィックス（storeEnabled） ✅ 完了（2026-03-23、store: false固定化 + previousResponseId完全廃止）

| 項目 | 値 |
|------|-----|
| 工数 | 30分 |
| 優先度 | **CRITICAL** |
| 完了日 | 2026-03-22 |

### 対応結果

`store: false` 固定化を実施。さらに設計見直しにより以下を包括的に実施:

- `storeEnabled` パラメータ完全削除（Worker/Electron両側）
- `previousResponseId` 完全削除（会話文脈は直近5ターン原文で管理）
- `previous_response_id` リトライロジック削除
- `settings.service.ts` 完全削除
- `StoreEnabledToggle` UIコンポーネント完全削除
- `session.service.ts` からpreviousResponseId関連メソッド削除（startSession/endSessionは将来用に残存）

> **設計判断:** 面接支援アプリではAIの提案ではなく候補者の実際の発言が会話文脈。
> `previous_response_id` はAIの提案履歴（≠実際の会話）を参照するため不適切と判断。
> 会話文脈は直近5ターン原文 + 将来のローリングサマリーで管理する方針に変更。

---

## Phase 2: F-11 Soniox v4 RT 完全移行

### 概要

| 項目 | 値 |
|------|-----|
| 工数 | 2-3日（評価1日 + 実装1-2日） |
| 優先度 | MUST |
| 期待効果 | STTコスト74%削減（$0.0077/分 → $0.002/分）、日本語精度向上 |
| 前提条件 | Soniox APIキー取得 |
| リスク | 日本語面接音声での精度が未検証 |
| 方針 | **Deepgram完全廃止・Soniox完全移行（フォールバックなし）** |

> **設計判断:** Deepgramフォールバックを残すと、2つのWebSocketプロトコル・イベントマッピング・
> トランスクリプト変換ロジックを内包する技術負債となる。評価（Step 1）の合否判定を厳格にし、
> 合格時はSoniox完全移行、不合格時はPlan Bを検討する。

### 現状のDeepgram実装（実査結果）

**変更対象ファイル一覧:**

| ファイル | 行数 | 変更内容 |
|---------|------|---------|
| `src/services/stt.service.ts` | 199行 | Deepgram SDK → Soniox WebSocket接続に全面差替 |
| `src/main/ipc.ts` | L148-300 | STT IPC ハンドラー（トークン取得・接続管理） |
| `src/preload/index.ts` | L181-201 | STT API定義（変更不要の可能性あり） |
| `src/renderer/src/env.d.ts` | L3-9 | TranscriptResult型（変更不要） |
| `apps/worker/src/routes/stt.ts` | 99行 | トークン生成エンドポイント |
| `apps/worker/src/lib/deepgram.ts` | 78行 | **削除**（Soniox用 `stt-token.ts` を新規作成） |
| `src/renderer/src/hooks/useAudioCapture.ts` | - | 変更不要（PCM 16kHz 16bit mono出力は互換） |

**現行Deepgram接続パラメータ（`stt.service.ts` L49-60）:**

```typescript
{
  model: 'nova-3',
  language: 'ja',
  smart_format: true,
  interim_results: true,
  utterance_end_ms: 1000,
  endpointing: 300,
  vad_events: true,
  encoding: 'linear16',
  sample_rate: 16000,
  channels: 1,
}
```

> **注意:** `deepgram.ts` L68 の `DEFAULT_STT_CONFIG` では `model: 'nova-2'` のまま未更新。
> Soniox移行で `deepgram.ts` 自体を削除するため、この不整合は自動解消される。

**Soniox対応パラメータ（公式ドキュメント確認済み）:**

```json
{
  "api_key": "<TEMPORARY_KEY>",
  "model": "stt-rt-v4",
  "audio_format": "pcm_s16le",
  "sample_rate": 16000,
  "num_channels": 1,
  "language_hints": ["ja"],
  "enable_endpoint_detection": true,
  "max_endpoint_delay_ms": 1000
}
```

### 詳細ステップ

#### Step 1: 評価（1日）

| # | 作業 | 詳細 |
|---|------|------|
| 1-1 | Soniox APIキー取得 | https://soniox.com でアカウント作成 |
| 1-2 | WebSocket接続テスト | エンドポイント: `wss://stt-rt.soniox.com/transcribe-websocket` |
| 1-3 | 音声フォーマット確認 | PCM 16kHz 16bit mono (`pcm_s16le`) — 現行と完全互換。エンディアン: little-endian（両者互換） |
| 1-4 | 日本語精度比較 | **評価マトリクス**（下記参照） |
| 1-5 | エンドポイント検出テスト | `enable_endpoint_detection: true` + `max_endpoint_delay_ms: 1000` |
| 1-6 | レイテンシ計測 | TTFT（最初のトークンまでの時間）を記録 |
| 1-7 | keepalive動作確認 | 音声一時停止時の `{"type":"keepalive"}` 送信テスト |

**評価マトリクス（Step 1-4）:**

| テスト種別 | サンプル数 | 評価観点 |
|-----------|----------|---------|
| 自然発話面接音声 | 10 | 一般的な面接会話の認識精度 |
| 技術用語含む面接音声 | 5 | 「マイクロサービス」「Kubernetes」等の認識 |
| Zoom/Teams経由システム音声 | 5 | desktopCapturer経由の音声品質 |
| 背景雑音あり環境 | 3 | ノイズ耐性 |

**判定基準:** 日本語精度同等以上 + レイテンシ同等以下 → Step 2へ
**不合格時:** [Plan B](#plan-b-soniox不合格時の代替案) を検討

#### Step 2: stt.service.ts 全面差替（1日）

**現行:** `@deepgram/sdk`の`createClient().listen.live()`でWebSocket接続
**変更後:** 素のWebSocket（`ws`パッケージ）でSoniox接続

変更箇所:
- L1: `import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'` → `import WebSocket from 'ws'`
- L49-60: 接続パラメータをSoniox形式に変換
- L73: `LiveTranscriptionEvents.Open` → WebSocket `open`イベント
- L81: `LiveTranscriptionEvents.Transcript` → JSONパースでトークン配列を処理
  - Deepgram: `data.channel?.alternatives?.[0]` → Soniox: `response.tokens[]`
  - `data.is_final` → `token.is_final`
  - `data.speech_final` → エンドポイント検出イベント
- L99: `LiveTranscriptionEvents.Error` → WebSocket `error`イベント
- L109: `LiveTranscriptionEvents.Close` → WebSocket `close`イベント
- L123: `connection.keepAlive()` → **Soniox keepalive実装（下記参照）**
- L178: `connection.send()` → `ws.send()` (バイナリフレーム)
- L189: `connection.requestClose()` → 空フレーム送信で切断

**Soniox keepalive要件（公式ドキュメント）:**

> 音声を送信していない時は少なくとも20秒毎に `{"type":"keepalive"}` を送信する必要がある。
> 音声を継続的に送信している場合はkeepaliveは不要。
> 接続自体は最大5時間維持可能。

```typescript
// keepaliveタイマー実装
private keepaliveInterval: NodeJS.Timeout | null = null

private startKeepalive(): void {
  this.keepaliveInterval = setInterval(() => {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'keepalive' }))
    }
  }, 15000) // 15秒間隔（20秒制限に余裕を持たせる）
}

private stopKeepalive(): void {
  if (this.keepaliveInterval) {
    clearInterval(this.keepaliveInterval)
    this.keepaliveInterval = null
  }
}
```

**Soniox応答フォーマット:**
```json
{
  "tokens": [
    { "text": "Hello", "start_ms": 600, "end_ms": 760, "confidence": 0.97, "is_final": true }
  ],
  "final_audio_proc_ms": 760,
  "total_audio_proc_ms": 880
}
```

**TranscriptResult変換ロジック:**
```typescript
// Soniox tokens → TranscriptResult
const finalText = tokens.filter(t => t.is_final).map(t => t.text).join('')
const interimText = tokens.filter(t => !t.is_final).map(t => t.text).join('')
const result: TranscriptResult = {
  text: finalText || interimText,
  isFinal: tokens.every(t => t.is_final),
  confidence: tokens.reduce((sum, t) => sum + t.confidence, 0) / tokens.length,
  timestamp: Date.now(),
  source,
}
```

#### Step 3: Worker側トークン生成差替 + Deepgram完全削除（半日）

**現行（`deepgram.ts` L17-62）:** `https://api.deepgram.com/v1/auth/grant` で一時トークン生成
**変更後:** Soniox一時キー生成（REST API）

変更:
- `apps/worker/src/lib/deepgram.ts` → **削除**
- `apps/worker/src/lib/stt-token.ts` → **新規作成**
- `apps/worker/src/routes/stt.ts` L37: `generateTemporaryToken()` の呼び出し先を `stt-token.ts` に変更

**Soniox一時キー生成API:**

```typescript
// stt-token.ts
const SONIOX_TEMP_KEY_URL = 'https://api.soniox.com/v1/auth/temporary-api-key'

export async function generateTemporaryToken(
  apiKey: string,
  expiresInSeconds: number = 600 // 10分
): Promise<string> {
  const response = await fetch(SONIOX_TEMP_KEY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      usage_type: 'transcribe_websocket',
      expires_in_seconds: expiresInSeconds,
    }),
  })

  if (!response.ok) {
    throw new Error(`Soniox temp key generation failed: ${response.status}`)
  }

  const data = await response.json()
  return data.api_key // 例: "temp:WYJ67RBEFUWQXXPKYPD2UGXKWB"
}

export const DEFAULT_STT_CONFIG = {
  model: 'stt-rt-v4',
  audio_format: 'pcm_s16le',
  sample_rate: 16000,
  num_channels: 1,
  language_hints: ['ja'],
  enable_endpoint_detection: true,
  max_endpoint_delay_ms: 1000,
}
```

#### Step 4: テスト + パッケージ更新（半日）

- `pnpm remove @deepgram/sdk` — **完全削除**
- 素WebSocket実装方針を確定（`ws`採用時は `pnpm add ws`、必要に応じて `pnpm add -D @types/ws`）
- 既存テスト更新: `stt.service.test.ts`
- Worker側テスト: `stt-token.test.ts` 新規作成
- `wrangler.toml`: `SONIOX_API_KEY` 環境変数追加、`DEEPGRAM_API_KEY` 削除
- CLAUDE.md のDeepgram関連記載を更新

**テスト項目:**

| テスト | 種別 | 内容 |
|--------|------|------|
| WebSocket接続/切断 | ユニット | モックWSでopen/close/errorイベント |
| トークン変換 | ユニット | Soniox tokens → TranscriptResult変換 |
| keepalive | ユニット | 15秒間隔タイマー動作 |
| 一時キー生成 | ユニット | REST API呼び出し + エラーハンドリング |
| E2E接続テスト | 統合 | 実際のSoniox APIでの音声認識 |

**ロールバック計画:** Deepgramコードはgit履歴に残るため、`git revert` で復元可能。
移行完了後に `@deepgram/sdk` を再インストールすれば即座に切り戻し可能。


## Phase 2.5: E-1/E-2 プライバシー

### E-1: store オプトイン UI ✅ 不要化（Day 0で包括対応済み）

❌ 不要化（2026-03-23）: store: false固定化によりオプトインUI不要。settings.service.ts、StoreEnabledToggle.tsx、関連IPC/preload APIは全削除済み。previousResponseIdも完全廃止。

`store: false` 固定化により、OpenAI にデータを保存しない設計に変更。
オプトインUI自体が不要になったため、以下を削除済み:
- `settings.service.ts`（完全削除）
- `StoreEnabledToggle.tsx`（完全削除）
- `settings:getStoreEnabled` / `settings:setStoreEnabled` IPCハンドラー（削除）
- `env.d.ts` の settings 型定義（削除）

### E-2: プライバシーポリシー更新 ✅ 完了（2026-03-23）

| 項目 | 値 |
|------|-----|
| 工数 | 1時間 |
| 優先度 | **MUST** |
| 変更ファイル | `apps/web/app/privacy/page.tsx` |

**追加項目:**
- OpenAI Responses API `store` パラメータの説明
- オプトイン時のデータ保存期間（30日間）
- ユーザーが設定画面から無効化できること

---

## Phase 3: F-9 プロフィールキャッシュ ✅ 完了（2026-03-23）

| 項目 | 値 |
|------|-----|
| 工数 | 半日 |
| 優先度 | SHOULD |
| 期待効果 | -10〜50ms/リクエスト |
| 前提条件 | なし |

### 現状（実査結果）

プロフィール取得は以下3箇所で毎リクエスト実行:

| 呼び出し元 | ファイル:行 | クエリ |
|-----------|-----------|--------|
| `/generate-v2` (committed) | `ai.ts` L138 | `supabase.from('profiles').select('interview_profile').eq('id', userId).single()` |
| `/generate` | `ai.ts` L309 | 同上 |
| `POST /api/questions/generate` | `questions.ts` L465 | 同上 |

- `/generate-v2` speculative フェーズではスキップ済み（L136-139）
- 面接中にプロフィールが変わる頻度: 0%（セッション中は不変）

### 詳細ステップ

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | キャッシュヘルパー作成 | `apps/worker/src/lib/profile-cache.ts`（新規） | Cloudflare Cache APIでプロフィールを5分間キャッシュ |
| 2 | ai.ts のプロフィール取得差替 | `apps/worker/src/routes/ai.ts` L138, L309 | `getCachedProfile(userId, supabase, ctx)` に変更 |
| 3 | questions.ts の差替 | `apps/worker/src/routes/questions.ts` L465 | 同上 |
| 4 | キャッシュ無効化 | `apps/worker/src/routes/` (profile更新API) | プロフィール更新時に `cache.delete()` |

**キャッシュ実装パターン（既存 `embedding-cache.ts` と同じ）:**

```typescript
const PROFILE_CACHE_TTL_SEC = 300 // 5分
const cacheKey = `https://profile-cache.internal/${userId}`

export async function getCachedProfile(
  userId: string,
  supabase: SupabaseClient,
  ctx?: ExecutionContext
): Promise<InterviewProfile | null> {
  const cache = caches.default
  const cached = await cache.match(new Request(cacheKey))
  if (cached) return cached.json()

  const { data } = await supabase
    .from('profiles')
    .select('interview_profile')
    .eq('id', userId)
    .single()

  const profile = data?.interview_profile ?? null
  if (ctx) {
    ctx.waitUntil(cache.put(
      new Request(cacheKey),
      new Response(JSON.stringify(profile), {
        headers: { 'Cache-Control': `max-age=${PROFILE_CACHE_TTL_SEC}` }
      })
    ))
  }
  return profile
}
```

**テスト項目:**
- キャッシュヒット/ミスの動作確認
- プロフィール更新時のキャッシュ無効化
- TTL期限切れ後の再取得

---

## Phase 3: F-10 使用量チェックキャッシュ ✅ 完了（2026-03-23）

| 項目 | 値 |
|------|-----|
| 工数 | 半日 |
| 優先度 | SHOULD |
| 期待効果 | -50〜200ms/リクエスト |
| 前提条件 | なし |

### 現状（実査結果）

使用量チェックは `checkAndReserveUsage()` RPC（`usage.ts` L76-105）で毎リクエスト実行:

| エンドポイント | 使用量チェック方式 | クエリ内容 |
|-------------|------------------|----------|
| `/generate-v2` | RPC ×1 | `check_and_reserve_usage` RPC |
| `/generate` | RPC ×1 | 同上 |
| `/summarize` | RPC ×1 | 同上 |
| `/embeddings` | RPC ×1 | 同上 |
| `POST /documents` | SELECT ×3（RPC未使用） | `profiles.subscription_tier` + `subscription_plans.max_documents` + `documents` count |

### 詳細ステップ

> **v1からの設計変更:** v1では「許可のみキャッシュ」方式だったが、レースコンディションリスク
> （キャッシュヒット時にreserve RPCをスキップし、別タブ/デバイスからの使い切りを検知できない）
> があるため、「拒否（上限到達）のみキャッシュ」方式に変更。

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | 「拒否」結果キャッシュ | `apps/worker/src/lib/usage.ts` | 上限到達時のみCloudflare Cache APIで30秒キャッシュ |
| 2 | 「許可」は常にRPC実行 | 同上 | reserve操作のアトミック性を維持 |
| 3 | 上限到達キャッシュ無効化 | 同上 | 月次リセット時・プランアップグレード時にキャッシュ削除 |

**キャッシュキー:** `https://usage-denied.internal/${userId}/${resourceType}`
**TTL:** 30秒（「拒否」結果のみ）
**無効化:** 月次使用量リセット時、プランアップグレード時

**実装:**

```typescript
export async function isUsageDenied(
  userId: string,
  resourceType: string,
): Promise<boolean> {
  const cache = caches.default
  const key = `https://usage-denied.internal/${userId}/${resourceType}`
  const cached = await cache.match(new Request(key))
  return cached !== undefined  // 拒否キャッシュあり → 即座に拒否
}

export async function cacheDeniedResult(
  userId: string,
  resourceType: string,
  ctx?: ExecutionContext,
): Promise<void> {
  const cache = caches.default
  const key = `https://usage-denied.internal/${userId}/${resourceType}`
  if (ctx) {
    ctx.waitUntil(cache.put(
      new Request(key),
      new Response('1', { headers: { 'Cache-Control': 'max-age=30' } })
    ))
  }
}

// 使用フロー:
// 1. isUsageDenied() → true → 即座に429返却（RPCスキップ）
// 2. isUsageDenied() → false → checkAndReserveUsage() RPC実行
//    → 拒否された場合 → cacheDeniedResult() で30秒キャッシュ
```

> **セキュリティ:** キャッシュ不整合で無料ユーザーが無制限利用できるリスクはない。
> 「拒否のみキャッシュ」方式では、キャッシュミス時は常にRPCで正確な判定を行うため、
> 許可が誤って出ることはない。逆に拒否キャッシュが残って一時的に利用不可になるケースは
> あるが、TTL 30秒で自動解消される。

**テスト項目:**
- 上限到達時のキャッシュ書き込み・読み取り
- TTL期限切れ後のRPC再実行
- プランアップグレード時のキャッシュ無効化
- 同時リクエストでのレースコンディションテスト

---

## Phase 3: F-1 プロンプト最適化

| 項目 | 値 |
|------|-----|
| 工数 | 1日（v1: 半日 → 品質検証の反復を考慮して1日に修正） |
| 優先度 | SHOULD |
| 期待効果 | -50〜100ms（入力トークン削減 → TTFT改善） |
| 前提条件 | C-2 ベースライン計測完了 |

### 現状（実査結果）

| プロンプト | ファイル:行 | 文字数 | 推定トークン数 |
|-----------|-----------|--------|-------------|
| `SYSTEM_PROMPT` | `prompts.ts` L8-29 | 529文字 | ~168トークン |
| `SPECULATIVE_SYSTEM_PROMPT` | `prompts.ts` L101-103 | 101文字 | ~33トークン |
| `QUESTION_GENERATION_PROMPT` | `prompts.ts` L62-87 | 535文字 | ~161トークン |

- `SPECULATIVE_SYSTEM_PROMPT` は既に最小（33トークン）→ 最適化不要
- `SYSTEM_PROMPT`（168トークン）が主な最適化対象
- `QUESTION_GENERATION_PROMPT`（161トークン）は一回限りの使用 → 優先度低

### 詳細ステップ

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | SYSTEM_PROMPT の冗長部分削減 | `apps/worker/src/lib/prompts.ts` L8-29 | 指示の重複排除、箇条書き圧縮 |
| 2 | tiktoken でトークン数計測 | ローカル検証 | 最適化前後のトークン数を正確に比較 |
| 3 | 品質検証（反復） | 手動テスト | 同一質問10問で回答品質比較。不十分なら調整→再テスト |

**目標:** SYSTEM_PROMPT 168トークン → 120トークン以下（-30%）

**注意:** プロンプト変更は回答品質に直結するため、A/Bテスト推奨。
プロンプトエンジニアリングは反復的な作業であり、半日では品質検証が不十分になるリスクがある。

**ロールバック計画:** 旧プロンプトをコメントとして残すか、git履歴から復元。

---

## Phase 3: F-6 RAGキャッシュ無効化 ✅ 完了（2026-03-23）

| 項目 | 値 |
|------|-----|
| 工数 | 半日 |
| 優先度 | SHOULD |
| 期待効果 | RAG精度向上（陳腐化防止） |
| 前提条件 | なし |

### 現状（実査結果）

**Embeddingキャッシュ（`embedding-cache.ts`）:**
- Cloudflare Cache API、TTL 600秒（10分）
- キャッシュキー: `SHA-256(normalized_question)` — **user_idを含まない**
- ドキュメント更新・削除時にキャッシュクリア: **未実装**

**問題箇所:**

| 操作 | ファイル:行 | キャッシュ影響 |
|------|-----------|-------------|
| ドキュメント削除 | `documents.ts` L189-235 | ❌ embeddingキャッシュ未クリア → 10分間stale |
| 質問保存 | `questions.ts` L238-347 | ❌ 同上 |
| 質問削除 | `questions.ts` L351-411 | ❌ 同上 |

### 詳細ステップ

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | キャッシュ無効化関数追加 | `apps/worker/src/lib/embedding-cache.ts` | `invalidateEmbeddingCache(question: string)` 追加 |
| 2 | ドキュメント削除時にクリア | `apps/worker/src/routes/documents.ts` L189-235 | 削除対象チャンクのembeddingキャッシュをクリア |
| 3 | 質問CRUD時にクリア | `apps/worker/src/routes/questions.ts` | POST/DELETE時にキャッシュクリア |
| 4 | user_idをキャッシュキーに追加 | `apps/worker/src/lib/embedding-cache.ts` L15-22 | キャッシュ無効化の精度向上 |

> **user_id追加の目的について:** embeddingはモデル固有の数値列であり、同じテキストなら
> ユーザーに関係なく同じembeddingが生成される。したがってuser_id追加の主目的は
> 「セキュリティ」ではなく「ドキュメント更新時の無効化精度向上」（ユーザーAのドキュメント削除時に
> ユーザーBのキャッシュを巻き込まない）。ただしuser_id追加によりキャッシュ効率は若干低下する。

**実装:**

```typescript
// embedding-cache.ts に追加
export async function invalidateEmbeddingCache(text: string): Promise<void> {
  const cache = caches.default
  const key = await normalizeKey(text)
  await cache.delete(new Request(key))
}
```

**注意:** ドキュメント削除時、関連する全チャンクのcontentに対してキャッシュ無効化が必要。チャンク数が多い場合（50+）はバッチ処理を検討。

**テスト項目:**
- ドキュメント削除後のembeddingキャッシュクリア確認
- 質問CRUD後のキャッシュクリア確認
- user_id付きキャッシュキーの衝突テスト

---

## Phase 3: I-3 pgvector iterative scan ✅ 完了（2026-03-23、Supabase MCP経由で適用済み、pgvector 0.8.0確認済み）

| 項目 | 値 |
|------|-----|
| 工数 | 1時間 |
| 優先度 | SHOULD |
| 期待効果 | user_idフィルタ付き検索の精度向上 |
| 前提条件 | Supabase pgvector **0.8.0+**（v1では0.7.0+と記載していたが、iterative scanは0.8.0で追加された機能） |

### 現状（実査結果）

**`match_documents_with_info` RPC（マイグレーションファイル）:**

```sql
WHERE dc.user_id = p_user_id
  AND 1 - (dc.embedding <=> query_embedding) > match_threshold
ORDER BY dc.embedding <=> query_embedding
LIMIT match_count;
```

- ベクトル検索 + `user_id` フィルタの組み合わせ
- HNSWインデックス: 明示的な作成なし（Supabaseデフォルト）
- `iterative_scan`: **未設定**

**問題:** HNSWインデックスはpre-filterに対応しないため、`user_id`フィルタでヒット数が少ないとインデックスが候補を使い果たし、`match_count`件に満たない結果を返す可能性がある。

### 詳細ステップ

| # | 作業 | 変更方法 | 変更内容 |
|---|------|---------|---------|
| 1 | Supabase pgvector バージョン確認 | Supabase Dashboard → Extensions | **0.8.0以上**であることを確認 |
| 2 | iterative scan 有効化 | SQL Editor またはマイグレーション | RPC関数内に `SET LOCAL` 追加 |
| 3 | テスト | 手動検索テスト | user_idフィルタ時の結果件数確認 |

> **バージョン注意:** iterative scanはpgvector 0.8.0で追加された機能。0.7.0では利用不可。
> Supabase Dashboardで現在のpgvectorバージョンを確認し、必要に応じてPostgresバージョンの
> アップグレード（Dashboard → Settings → Infrastructure）を行うこと。

**マイグレーションSQL:**

```sql
CREATE OR REPLACE FUNCTION match_documents_with_info(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  document_name text,
  document_type text
)
LANGUAGE plpgsql STABLE  -- sql → plpgsql に変更（SET LOCAL使用のため）
AS $$
BEGIN
  SET LOCAL hnsw.iterative_scan = 'relaxed_order';
  SET LOCAL hnsw.max_scan_tuples = 20000;

  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.id AS document_id,
    d.name AS document_name,
    d.type AS document_type
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = p_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**注意:**
- `LANGUAGE sql` → `LANGUAGE plpgsql` への変更が必要（`SET LOCAL`は`sql`関数内で使用不可）
- パフォーマンスへの影響は軽微（plpgsqlのオーバーヘッド: <1ms）
- `hnsw.iterative_scan` は `strict_order`（厳密順序）と `relaxed_order`（緩和順序、高速）の2モード。フィルタ付き検索では `relaxed_order` が推奨
- `max_scan_tuples = 20000` はpgvector公式ドキュメントの推奨値。Maxプラン（200ドキュメント）でも十分

**ロールバックSQL:**

```sql
-- 元のsql関数に戻す
CREATE OR REPLACE FUNCTION match_documents_with_info(...)
LANGUAGE sql STABLE AS $$
  SELECT ... -- SET LOCAL なしの元のクエリ
$$;
```

---

## Phase 3: F-2 セッション内キャッシュ強化 ✅ 完了（2026-03-23、F-2a Speculativeキャッシュ + F-2b 採用率ベース閾値）

| 項目 | 値 |
|------|-----|
| 工数 | 2日 |
| 優先度 | SHOULD |
| 期待効果 | -100〜300ms |
| 前提条件 | D-2, D-3 完了済み ✅ |

### 現状（実査結果）

| サブタスク | ステータス | 詳細 |
|-----------|----------|------|
| Bigramキャッシュ | ✅ 完了 | `useQuestionCache.ts` L38-62（セッション内永続、最大200エントリ制限） |
| Speculative結果キャッシュ（5分TTL） | ❌ 未着手 | 現在はターン毎に再生成 |
| 採用率ベース閾値調整 | ❌ 未着手 | 現在は固定閾値 0.3 |

> **v1からの修正:** v1では「Bigramキャッシュ3分TTL」と記載していたが、実装はセッション内永続
> キャッシュ（TTLなし、最大200エントリ制限）。計画書の記載を実装に合わせて修正。

### F-2a: Speculative結果キャッシュ

**現状:** `useProgressiveAI.ts` では毎ターン新規にSpeculative生成を実行。前回の結果は破棄。

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | キャッシュMap追加 | `src/renderer/src/hooks/useProgressiveAI.ts` | `speculativeCacheRef = useRef(new Map<string, {text, timestamp}>())` |
| 2 | キャッシュヒット判定 | 同上（`triggerInterimGen` / speculative生成起動直前） | bigramSimilarity ≥ 0.8 かつ TTL 5分以内 → キャッシュ再利用 |
| 3 | キャッシュ書き込み | 同上 | Speculative完了時にキャッシュ保存 |
| 4 | キャッシュサイズ制限 | 同上 | 最大50エントリ、LRU eviction |

**テスト項目:**
- LRU evictionの動作確認（51件目追加時に最古エントリ削除）
- TTL 5分超過時のキャッシュミス
- bigramSimilarity境界値（0.79 → ミス、0.80 → ヒット）

### F-2b: 採用率ベース閾値調整

**現状:** `speculative-adoption.ts` で `changeRate ≤ 0.3` 固定。`useLatencyMetrics.ts` に `speculative_adopted` フィールド存在。

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | 採用率計算関数 | `src/renderer/src/hooks/useProgressiveAI.ts` | 直近20ターンの採用率を計算 |
| 2 | 動的閾値調整 | `src/renderer/src/utils/speculative-adoption.ts` | 採用率 >70% → 閾値0.4に緩和、<30% → 閾値0.2に厳格化 |
| 3 | 閾値変更ログ | `useLatencyMetrics.ts` | 閾値変更イベントを記録 |

> **注意:** `useProgressiveAI.ts` は既に多くのref/stateを持っている。採用率計算ロジックは
> 独立したユーティリティ関数として抽出し、hookの複雑度を上げないようにする。

---

## リファクタリング: R-2 型定義共有化 🔄 実装中（2026-03-23）

| 項目 | 値 |
|------|-----|
| 工数 | 2-3日（v1: 半日〜1日 → env.d.tsアンビエント宣言変更の影響範囲を考慮して修正） |
| 優先度 | COULD |
| 期待効果 | 保守性向上、型の不整合リスク排除 |
| 前提条件 | なし |

> **工数修正理由:**
> - `env.d.ts` のアンビエント宣言（`declare global`）からimport文への変更は、
>   rendererプロセスのTypeScript解決に広範な影響がある
> - 14件の型定義 x 最大3箇所 = 最大42箇所の変更 + テスト修正
> - electron-viteのrendererビルドでの `src/types/` パス解決のデバッグが必要な可能性

### 現状（実査結果）

**重複型定義 14件:**

| 型名 | 定義箇所数 | 差異 |
|------|----------|------|
| `AIResponse` | 3箇所 | ai.service.ts にJSDocコメント追加（実質同一） |
| `TranscriptResult` | 4箇所 | 完全同一 |
| `GenerateOptions` | 2箇所 | 差異解消済み: `previousResponseId`, `storeEnabled` は両側から削除（store: false 固定化） |
| `InterviewProfile` | 3箇所 | 完全同一 |
| `User` | 3箇所 | **構造差異:** auth.ts は `UserUsage` 分離、env.d.ts/preload はインライン（実質同一） |
| `DocumentInfo` | 2箇所 | 完全同一 |
| `SubscriptionTier` | 3箇所 | 完全同一 |
| `SubscriptionStatus` | 3箇所 | 完全同一 |
| `AuthState` | 3箇所 | 完全同一 |
| `InterviewQuestion` | 3箇所 | 完全同一 |
| `QuestionInput` | 3箇所 | 完全同一 |
| `GeneratedQuestion` | 3箇所 | 完全同一 |
| `AudioSource` | 2箇所 | 完全同一 |
| `DocType` | 3箇所 | preloadでは `DocumentType` と命名（値は同一） |

**ビルド構成（`electron.vite.config.ts`）:**
- main: `src/main/**` + `src/services/**`
- preload: `src/preload/**`
- renderer: `src/renderer/**`

**tsconfig:**
- `tsconfig.node.json` (main/preload): `include: ["src/main/**/*", "src/preload/**/*", "src/services/**/*", "src/types/**/*"]`
- `tsconfig.web.json` (renderer): `include: ["src/renderer/**/*"]` — **`src/types/` を含まない**

**根本原因:** renderer の tsconfig が `src/types/` を参照できないため、`env.d.ts` にアンビエント型として重複定義している。

### 詳細ステップ（3コミットに分割）

> **v1からの変更:** v1では「1コミットで全変更」としていたが、ビルド失敗時のデバッグ容易性と
> 安全なロールバックのため、3コミットに分割する。

**コミット1: 共有型ファイル + tsconfig変更**

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 1 | 共有型ファイル作成 | `src/types/shared.ts`（新規） | 全プロセス共通の型を集約 |
| 2 | tsconfig.web.json 修正 | `tsconfig.web.json` | `include` に `"src/types/**/*"` 追加 |
| 3 | electron.vite.config 確認 | `electron.vite.config.ts` | renderer ビルドで `src/types/` のimportが解決可能か検証 |
| 4 | ビルド検証 | `pnpm build` | 3プロセス全てビルド成功を確認 |

**コミット2: main/preload/services のimport変更**

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 5 | preload/index.ts から重複型削除 | `src/preload/index.ts` | `import type { ... } from '../types/shared'` に変更 |
| 6 | サービス層のimport変更 | `src/services/ai.service.ts`, `stt.service.ts` | `import type { ... } from '../types/shared'` |
| 7 | main/ipc.ts のimport変更 | `src/main/ipc.ts` | 同上 |
| 8 | ビルド検証 | `pnpm build` | main/preloadビルド成功を確認 |

**コミット3: renderer のenv.d.ts変更**

| # | 作業 | 変更ファイル | 変更内容 |
|---|------|------------|---------|
| 9 | env.d.ts から重複型削除 | `src/renderer/src/env.d.ts` | アンビエント型定義を削除、`import type` に変更 |
| 10 | renderer hooks のimport変更 | `src/renderer/src/hooks/*.ts` | `import type { ... } from '@/types/shared'` (パスエイリアス経由) |
| 11 | ビルド検証 | `pnpm build` | rendererビルド成功を確認 |
| 12 | テスト実行 | `pnpm test` + `cd apps/worker && npx vitest run` | 全テスト通過を確認 |

**`src/types/shared.ts` の内容（注: 現行 `env.d.ts` をソース・オブ・トゥルースとして一致させる）:**

```typescript
// === IPC境界を跨ぐ共有型 ===

export interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
  source?: 'mic' | 'system'
}

export interface AIResponse {
  answer: string
  suggestions: string[]
  /** Confidence score 0-1, or -1 if not computed (SSE streaming mode) */
  confidence: number
}

export interface InterviewProfile {
  fullName: string
  nameReading?: string
  currentCompany?: string
  currentPosition?: string
  previousCompanies?: string[]
  targetCompany?: string
  targetPosition?: string
  technologies?: string[]
  certifications?: string[]
  education?: string
  yearsOfExperience?: number
  additionalNotes?: string
}

export interface UserUsage {
  sttMinutes: number
  aiTokens: number
  storageBytes: number
}

export interface User {
  id: string
  email: string
  name: string | null
  picture: string | null
  subscriptionTier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  subscriptionPeriodEnd: string | null
  usage: UserUsage
  interviewProfile: InterviewProfile | null
}

export type SubscriptionTier = 'free' | 'pro' | 'max'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing'
export type AudioSource = 'mic' | 'system' | 'both'
export type DocType = 'resume' | 'job_posting' | 'expected_qa'

export interface DocumentInfo {
  id: string
  name: string
  type: DocType
  uploadedAt: number
  chunkCount: number
}

export interface InterviewQuestion {
  id: string
  question: string
  answer: string
  sortOrder: number
  isAutoGenerated: boolean
  createdAt: string
  updatedAt: string
}

export interface QuestionInput {
  id?: string
  question: string
  answer: string
  sortOrder: number
}

export interface GeneratedQuestion {
  question: string
  answer: string
}

export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  error: string | null
}

// === レンダラー層非公開（IPC内部注入型） ===
export interface GenerateOptions {
  includeDocumentContext?: boolean
  maxTokens?: number
  turnId?: string
  speculativeText?: string
  // previousResponseId, storeEnabled は削除済み（store: false 固定化）
}

// レンダラー公開用サブセット
export type RendererGenerateOptions = Pick<
  GenerateOptions,
  'includeDocumentContext' | 'maxTokens' | 'turnId' | 'speculativeText'
>
```

**`env.d.ts` の変更後（Window interface部分のみ残す）:**

```typescript
import type {
  TranscriptResult, AIResponse, InterviewProfile, User,
  DocumentInfo, InterviewQuestion, QuestionInput, GeneratedQuestion,
  AuthState, SubscriptionTier, DocType, AudioSource, RendererGenerateOptions
} from '../../types/shared'

interface Window {
  electron: {
    stt: {
      start: () => Promise<{ success: boolean }>
      // ... （API定義のみ残す）
    }
    ai: {
      generateStream: (question: string, options?: RendererGenerateOptions) => Promise<...>
      // ...
    }
    // ...
  }
}
```

**リスク:**
- electron-vite が renderer ビルド時に `src/types/` を正しく解決できるか要検証
- パスエイリアス `@/types/shared` の設定が必要な可能性あり
- `env.d.ts` のアンビエント宣言からimport文への変更で、他ファイルの型解決に影響する可能性

**ロールバック計画:** 3コミットに分割しているため、問題が発生したコミットのみ `git revert` で戻せる。

---

## Phase 1 計測タスク: C-2〜C-7

### 概要

全てユーザー手動操作が必要。コード変更は不要。

| タスク | 内容 | 工数 | 前提 |
|--------|------|------|------|
| **C-2** | ベースライン TTFT p50/p95 計測 | 3時間 | Worker再デプロイ + アプリ起動 |
| **C-3** | 最適化適用後 TTFT 計測 | 2時間 | C-2完了 + 最適化施策適用後 |
| **C-4** | RAG タイムアウト率計測 | 30分 | C-2/C-3中に同時収集可 |
| **C-5** | gpt-5.4-nano TTFT 計測 | 1時間 | A-20完了済み ✅ |
| **C-6** | previous_response_id エラー率 | - | Workerログ確認 | ❌ 廃止: previousResponseId完全削除により計測不要 |
| **C-7** | Speculative採用率予備調査 | 1時間 | D-2完了済み ✅ |

**実行手順:**
1. `cd apps/worker && npx wrangler deploy` で最新コードをデプロイ
2. `pnpm dev` でアプリ起動
3. 面接セッション30-50ターン実施（C-2）
4. localStorage → `scripts/analyze-latency.ts` でレポート生成
5. C-4, C-6, C-7 は C-2 中のデータから並行集計可能
6. C-5 は別セッションで gpt-5.4-nano に一時切替して計測
7. C-3 は最適化施策適用後に再計測

> **重要:** C-2（ベースライン計測）は最適化施策（F-9, F-10等）を適用する**前**に実施すること。
> 計測後に最適化を適用し、C-3で効果を検証するサイクルを守る。

---

## 優先順位・依存関係マトリクス

### 推奨実行順序

```
Day 0 (即時):
  └─ ✅ storeEnabled: true → false ホットフィックスデプロイ

Week 1 前半:
  ├─ C-2 ベースライン計測（手動、最適化適用前に必ず実施）
  └─ F-11 Step 1: Soniox評価（C-2と並行実施可）

Week 1 後半:
  ├─ ✅ F-9  プロフィールキャッシュ（半日）
  ├─ ✅ F-10 使用量チェックキャッシュ（半日）
  └─ ✅ I-3  pgvector iterative scan（1時間）

Week 2:
  ├─ ✅ E-1  store オプトインUI（不要化）
  ├─ ✅ E-2  プライバシーポリシー更新（1時間）
  ├─ ✅ F-6  RAGキャッシュ無効化（半日）
  └─ F-1  プロンプト最適化（1日）

Week 3:
  ├─ F-11 Step 2-4: Soniox完全移行実装（1.5日、評価合格時）
  └─ C-3  最適化適用後 再計測 + C-4/C-5/C-6/C-7 並行収集

Week 4:
  ├─ ✅ F-2  セッション内キャッシュ強化（2日）
  └─ 🔄 R-2  型定義共有化（2-3日、フィーチャーブランチ）
```

> **v1からの主な変更点:**
> 1. Day 0 ホットフィックスを最優先に追加
> 2. C-2ベースライン計測をWeek 1前半に移動（最適化適用前に実施）
> 3. F-11評価をWeek 1に前倒し（MUSTなのにWeek 4+は矛盾していたため）
> 4. F-11実装をWeek 3に移動（評価合格後に即実装）
> 5. E-1/E-2をMUSTに格上げしWeek 2に配置
> 6. C-3を最適化後のWeek 3に移動（ベースラインとの比較を正確に）
> 7. R-2の工数を2-3日に修正

### 依存関係

```
Day 0  ✅完了（E-1も包括的に対応済み、store: false 固定化）
F-11 Step 2-4 ← F-11 Step 1 評価合格（不合格時はPlan B）
E-2  ← E-1完了済み（store: false 固定のためポリシーは「保存しない」旨を記載）
C-3  ← C-2（ベースライン必要）+ 最適化施策適用
F-2b ← C-7（採用率データが閾値調整の根拠）
F-1  ← C-2（プロンプト変更前のベースライン必要）
```

### 独立タスク（並行実行可能）

```
F-9, F-10, I-3, F-6 → 相互依存なし、任意の順序で実行可
R-2 → 他タスクと独立（ただし大規模変更のためフィーチャーブランチ推奨）
```

### 効果/工数比ランキング

| 順位 | タスク | 効果 | 工数 | 効果/工数比 |
|------|--------|------|------|-----------|
| 0 | Day 0 | 法的リスク排除 | 30分 | ★★★★★ ✅完了 |
| 1 | I-3 | 精度向上 | 1時間 | ★★★★★ ✅完了 |
| 2 | F-9 | -10〜50ms | 半日 | ★★★★ ✅完了 |
| 3 | F-10 | -50〜200ms | 半日 | ★★★★ ✅完了 |
| 4 | F-6 | 精度向上 | 半日 | ★★★★ ✅完了 |
| 5 | E-1+E-2 | コンプライアンス | 半日+1h | ★★★★ ✅完了 |
| 6 | F-1 | -50〜100ms | 1日 | ★★★ |
| 7 | F-11 | コスト74%削減 | 2-3日 | ★★★★（長期ROI高） |
| 8 | F-2 | -100〜300ms | 2日 | ★★★ ✅完了 |
| 9 | R-2 | 保守性 | 2-3日 | ★★ 🔄実装中 |

---

## レビュー指摘事項

### v1 → v2 で修正した事項

| # | カテゴリ | v1の問題 | v2での修正 |
|---|---------|---------|-----------|
| 1 | **ソースコード不整合** | `deepgram.ts` L68 の `DEFAULT_STT_CONFIG` が `nova-2` のまま（stt.service.tsはnova-3） | Soniox完全移行でdeepgram.ts自体を削除するため自動解消 |
| 2 | **ソースコード不整合** | `useQuestionCache.ts` を「3分TTL」と記載 | 実装通り「セッション内永続、最大200エントリ制限」に修正 |
| 3 | **ソースコード不整合** | `stt.ts` 97行、`deepgram.ts` 77行と記載 | 実測値 99行、78行に修正 |
| 4 | **業界標準との相違** | Soniox「keepalive不要」と記載 | 公式: 音声一時停止時は20秒毎にkeepalive必要。実装追加 |
| 5 | **業界標準との相違** | モデル名 `stt-rt-v4` と記載 | 公式は `stt-rt-v4`（自動v4ルーティング）。要最終確認の注記追加 |
| 6 | **業界標準との相違** | pgvector「0.7.0+」と記載 | iterative scanは**0.8.0**で追加。「0.8.0+」に修正 |
| 7 | **設計問題** | F-10: 「許可のみキャッシュ」でレースコンディション | 「拒否のみキャッシュ」方式に変更 |
| 8 | **優先順位矛盾** | F-11がMUSTなのにWeek 4+配置 | 評価をWeek 1前半、実装をWeek 3に前倒し |
| 9 | **優先順位矛盾** | C-2計測とF-9/F-10最適化がWeek 1に同居 | C-2をWeek 1前半に分離（最適化前に計測） |
| 10 | **法的リスク** | E-1/E-2がSHOULD | ✅ store: false 固定化で包括対応済み（E-1不要化） |
| 11 | **工数過小** | F-1: 半日、R-2: 半日〜1日 | F-1: 1日、R-2: 2-3日に修正 |
| 12 | **テスト計画欠如** | 各タスクにテスト項目なし | 全タスクにテスト項目を追加 |
| 13 | **ロールバック計画欠如** | R-2以外にロールバック計画なし | F-11, F-1, I-3にロールバック計画追加 |
| 14 | **Plan B欠如** | Soniox不合格時の代替案なし | Plan Bセクション追加 |
| 15 | **方針変更** | Deepgramフォールバック残置 | Soniox完全移行、`@deepgram/sdk`完全削除 |
| 16 | **工数変更** | F-11: 3-4日（フォールバック含む） | 2-3日（完全移行、フォールバック不要で短縮） |

### v2 追加レビュー（2026-03-23）: 重要な指摘（重大度順）

| 重大度 | 指摘 | 現状の問題 | 修正方針 |
|--------|------|-----------|---------|
| **Critical** | Day 0 / E-1 の `storeEnabled` 修正対象不足 | `src/main/ipc.ts` の `storeEnabled: true` は1箇所ではなく2箇所（L356, L427）存在 | ✅ **解決済み:** store: false 固定化により `storeEnabled` パラメータ自体を全削除。settings.service.ts / StoreEnabledToggle も削除 |
| **High** | F-11 Step 4 の `ws` 依存認識が不正確 | 計画書では「`ws` は既存依存」とあるが、現行 `package.json` に `ws` は存在しない | `ws`（必要なら `@types/ws`）追加手順を明記、または Node/Electron標準WebSocketで実装する方針を明文化 |
| **High** | F-9 のエンドポイント記載不一致 | 計画書は `/questions/:id/generate` と記載だが、実装は `POST /api/questions/generate`（route定義は `/generate`） | F-9現状表を `POST /api/questions/generate` に修正 |
| **High** | F-10 の `POST /documents` が「RPC 3回」と読める | 実装は `checkUsageLimit()` による `profiles` / `subscription_plans` / `documents` のSELECT系3クエリであり、`check_and_reserve_usage` RPC 3回ではない | 表の列名を「RPC回数」から「DBアクセス種別」に変更し、`POST /documents` は「SELECT×3（RPC未使用）」と明記 |
| **High** | R-2 サンプル型と現行型の乖離 | 例示 `shared.ts` の `SubscriptionStatus`（`none`）や `InterviewQuestion` 構造が現行 `env.d.ts` と不一致で、コピペ実装時に型不整合リスク | 「`env.d.ts` をソース・オブ・トゥルースとして転記する」注記を追記し、サンプル型を現行定義に合わせて更新 |
| **Medium** | F-2b のファイルパス誤り | `src/renderer/src/lib/speculative-adoption.ts` とあるが実体は `src/renderer/src/utils/speculative-adoption.ts` | F-2bの対象ファイルパスを `utils` に修正 |
| **Medium** | 行番号ベース指定のドリフト耐性不足 | `useProgressiveAI.ts` の「L108-118付近」など、改修によりすぐズレて実装ミスの原因になる | 行番号固定を避け、`triggerInterimGen` などシンボル/関数名ベースで変更位置を記載 |

### 未修正の既知事項（将来対応）

| # | 事項 | 対応方針 |
|---|------|---------|
| 1 | キャッシュ統一ヘルパー | 4つのキャッシュ層（embedding, profile, usage, speculative）のTTL/無効化/ログを一元管理する `cache.ts` の作成を検討 |
| 2 | モニタリング計画 | キャッシュヒット率、Soniox接続成功率、使用量キャッシュ不整合検出等のメトリクス可視化 |
| 3 | feature flag統一管理 | AI v1/v2切替、storeEnabled等の分散フラグを `feature-flags.service.ts` で一元管理 |
| 4 | 段階的ロールアウト | F-11 Soniox移行は全ユーザー一斉適用。規模拡大時はサーバー側制御の段階ロールアウトを検討 |
| 5 | OpenAI ZDR互換性 | エンタープライズ対応でZero Data Retention設定が必要になる可能性 |

---

## 注意事項

- 全ステップの変更ファイル・行番号は 2026-03-22 時点のソースコードに基づく
- Soniox v4 RT の価格 $0.002/分 は Soniox公式サイト（2026-02-05ブログ記事、公式価格ページ $0.12/hour）に基づく
- pgvector iterative scan は pgvector **0.8.0** 以降で利用可能。Supabase のバージョンを事前確認すること
- `GenerateOptions` の差異は解消済み（`previousResponseId`, `storeEnabled` を両側から削除）
- `store: false` 固定化により `previous_response_id` / `storeEnabled` 関連コードは全削除済み（2026-03-22）
- Cloudflare Cache API の `https://xxx.internal/` キャッシュキーパターンは公式推奨ではないが広く使われるパターン。既存の `embedding-cache.ts` で動作実績あり
