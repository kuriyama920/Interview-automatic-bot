# Phase Roadmap - 詳細実装計画

このドキュメントはPhase 6.5以降の詳細な実装計画を記載しています。

---

## Phase 6.5: システム音声キャプチャ（Zoom/Teams対応） ✅ 完了

### 目的
面接時にZoom/Teams等の相手の声（システム音声）もキャプチャし、文字起こしの精度を向上

### 技術的アプローチ

```
┌─────────────────────────────────────────────────────────┐
│                     音声ソース                           │
├─────────────────┬───────────────────────────────────────┤
│  マイク入力      │  システム音声（ループバック）           │
│  (自分の声)     │  (Zoom/Teams/Meet の相手の声)         │
└────────┬────────┴────────────────┬──────────────────────┘
         │                         │
         │  getUserMedia()         │  setDisplayMediaRequestHandler
         │                         │  + desktopCapturer (loopback)
         │                         │
         └────────────┬────────────┘
                      │
              ┌───────▼───────┐
              │  AudioContext  │
              │   (ミキシング)  │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │  16kHz PCM     │
              └───────┬───────┘
                      │
              ┌───────▼───────┐
              │    Soniox     │
              │  (文字起こし)  │
              └───────────────┘
```

### 実装方法の比較

| 方法 | パッケージ | 対応OS | 推奨 |
|-----|-----------|--------|-----|
| **setDisplayMediaRequestHandler** | なし（Electron組込） | Win/Mac/Linux | ⭐ **推奨** |
| electron-audio-loopback | npm | Win 10+/Mac 12.3+/Linux | ○ |
| getDisplayMedia (Renderer直接) | なし | Win/Mac/Linux | ○ |

#### 推奨理由（setDisplayMediaRequestHandler）
- 外部依存なし
- [Electron公式サポート](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- Chromium内蔵`audio: 'loopback'`オプション

### 実装タスク

#### 6.5.1 メインプロセス（src/main/index.ts）
```typescript
import { session, desktopCapturer } from 'electron'

// BrowserWindow作成後
session.defaultSession.setDisplayMediaRequestHandler(
  (request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      callback({ video: sources[0], audio: 'loopback' })
    })
  },
  { useSystemPicker: false }
)
```

#### 6.5.2 IPCハンドラー（src/main/ipc.ts）
```typescript
ipcMain.handle('audio:setSource', async (_, source: 'mic' | 'system' | 'both') => {
  settingsService.set('audioSource', source)
  return { success: true }
})

ipcMain.handle('audio:getSource', async () => {
  return settingsService.get('audioSource') || 'mic'
})
```

#### 6.5.3 レンダラー（src/renderer/src/hooks/useAudioCapture.ts）
```typescript
type AudioSource = 'mic' | 'system' | 'both'

const captureSystemAudio = async (): Promise<MediaStream> => {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true
  })
  stream.getVideoTracks().forEach(track => track.stop())
  return stream
}

const mixAudioStreams = (mic: MediaStream, system: MediaStream): MediaStream => {
  const ctx = new AudioContext()
  const dest = ctx.createMediaStreamDestination()
  ctx.createMediaStreamSource(mic).connect(dest)
  ctx.createMediaStreamSource(system).connect(dest)
  return dest.stream
}
```

#### 6.5.4 UI（SettingsModal.tsx）
```tsx
<select value={audioSource} onChange={(e) => setAudioSource(e.target.value)}>
  <option value="mic">マイクのみ（通常）</option>
  <option value="system">システム音声のみ</option>
  <option value="both">マイク + システム音声（面接モード）</option>
</select>
```

#### 6.5.5 型定義（src/types/settings.ts）
```typescript
export type AudioSource = 'mic' | 'system' | 'both'
```

### 注意事項
1. macOSでは一部制限あり（macOS 12.3+推奨）
2. WSL2ではシステム音声キャプチャ不可（Windows側で実行必要）
3. プライバシー: 全アプリ音声を拾う可能性あり

### 完了条件
- [x] setDisplayMediaRequestHandlerでloopback音声有効化
- [x] 3種類の音声ソース切り替え実装
- [x] UIで音声ソース選択可能
- [x] Zoom/Teamsでの動作確認
- [x] 設定の永続化

---

## Phase 7: Stripe決済 + サブスクリプション管理 ✅ 完了

### 目的
Stripe Checkoutで決済を行い、Googleアカウントに紐づけてサブスクリプション管理

### アーキテクチャ
```
Electron [プラン管理] → IPC → /api/stripe/checkout → Checkout Session URL
  → shell.openExternal() → ブラウザ → Stripe Checkout → 決済完了
  → Webhook → Supabase profiles 更新
  → Electron がポーリングで tier 変更を検知
```

### 実装ファイル

#### バックエンド (apps/api/)
| ファイル | 目的 |
|---------|------|
| lib/stripe.ts | Stripe クライアント（遅延初期化 Proxy） |
| lib/subscription.ts | Customer 管理、プラン解決、DB 更新ヘルパー |
| api/stripe/billing.ts | POST - Checkout Session 作成 + Customer Portal（統合） |
| api/stripe/webhook.ts | POST - Webhook 受信 + 署名検証 |
| api/stripe/pages.ts | GET - 決済成功/キャンセル HTML ページ（統合） |
| api/subscription.ts | GET - プラン + 使用量 + 全プラン一覧 |
| api/cron/reset-usage.ts | GET - 月次使用量リセット（Cloudflare Cron Trigger） |

#### Electron
| ファイル | 変更内容 |
|---------|---------|
| src/types/auth.ts | SubscriptionResponse 型追加 |
| src/preload/index.ts | subscription IPC チャンネル追加 |
| src/main/ipc.ts | subscription ハンドラー 4 本追加 |
| src/renderer/src/hooks/useSubscription.ts | サブスクリプション管理フック |
| src/renderer/src/App.tsx | ユーザーメニューにプラン管理ボタン追加 |

### Stripe設定手順
1. Stripe ダッシュボードで商品作成: Pro (¥2,980/月), Max (¥14,800/月)
2. 各 Price ID を subscription_plans テーブルに設定
3. Webhook URL 設定: `https://interview-bot-api.interviewautomaticbot92.workers.dev/api/stripe/webhook`
4. Webhook イベント: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, invoice.paid
5. Customer Portal を有効化

### 環境変数
```env
STRIPE_SECRET_KEY=sk_test_xxx     # or sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
CRON_SECRET=your-cron-secret
```

### 完了条件
- [x] /api/stripe/* 実装（checkout, webhook, portal）
- [x] /api/subscription 実装
- [x] Webhook 署名検証 + 5 イベント対応
- [x] Electron IPC + プラン管理 UI
- [x] 月次リセット Cron 設定
- [x] Stripe ダッシュボードで商品作成 + Price ID 設定
- [x] Stripe テストモードでの E2E 動作確認

---

## Phase 8: APIプロキシ ✅ 実装済み

### 目的
Soniox/OpenAI APIを運用者のキーで実行（ユーザーはAPIキー不要）。使用量追跡・制限チェックも同時に実装。

### アーキテクチャ

#### STTフロー
```
Electron → POST /api/stt/token (JWT)
  → 使用量チェック → カスタムキー確認 → Soniox一時APIキー発行(10分TTL)
  → Electron → Soniox WebSocket (wss://stt-rt.soniox.com) → 音声ストリーミング
  → セッション終了 → POST /api/stt/usage (JWT) → 使用量記録
```

#### AI生成フロー
```
Electron → POST /api/ai/generate (JWT + SSE)
  → 使用量チェック → pgvector RAGコンテキスト取得
  → OpenAI gpt-5-nano/gpt-5.4-nano ストリーミング → SSEレスポンス
  → 完了時に使用量記録 (トークン数)
```

### 実装ファイル

#### バックエンド (apps/api/)
| ファイル | 目的 |
|---------|------|
| lib/usage.ts | 使用量チェック (checkUsageLimit) + 記録 (recordUsage) + カスタムキー確認 |
| lib/stt-token.ts | Soniox一時APIキー生成（temporary-api-key REST、10分TTL） |
| api/stt/unified.ts | STT統合（token + usage）- __route パラメータで分岐 |
| api/ai/unified.ts | AI統合（generate + embeddings）- __route パラメータで分岐 |

#### Electron
| ファイル | 変更内容 |
|---------|---------|
| src/services/stt.service.ts | sessionStartTime + getSessionMinutes() 追加 |
| src/services/ai.service.ts | プロキシモード対応（useProxy + SSEパース） |
| src/main/ipc.ts | stt:start/stop, ai:init/generate/generateStream をプロキシ対応 |

#### DBマイグレーション
| ファイル | 内容 |
|---------|------|
| 009_usage_tracking_index.sql | usage_logs + profiles インデックス追加 |

### APIエンドポイント
| エンドポイント | 機能 | 認証 |
|---------------|------|------|
| POST /api/stt/token | Soniox一時APIキー発行 | JWT必須 |
| POST /api/stt/usage | STT使用量報告 | JWT必須 |
| POST /api/ai/generate | gpt-5-nano/gpt-5.4-nano SSEストリーミング | JWT必須 |
| POST /api/ai/embeddings | Embeddings生成 | JWT必須 |

### セキュリティ
- JWT認証必須（全エンドポイント）
- 使用量制限チェック（超過時 429 エラー）
- Soniox一時APIキー10分有効期限
- CORS制限
- セッション使用量上限120分（悪用防止）

### 後方互換性
- カスタムAPIキー（Pro/Max）を持つユーザーは引き続き直接接続
- 設定 → 環境変数の優先順位でカスタムキーを解決
- プロキシモード時のみ使用量を報告・追跡

### 完了条件
- [x] lib/usage.ts 使用量追跡ライブラリ
- [x] /api/stt/token, /api/stt/usage 実装
- [x] /api/ai/generate (SSE), /api/ai/embeddings 実装
- [x] stt.service.ts セッション時間追跡
- [x] ai.service.ts プロキシモード + SSEパース
- [x] ipc.ts プロキシ対応ハンドラー
- [x] DBマイグレーション 009 (インデックス)
- [x] Cloudflare Workersデプロイ + API動作確認
- [x] Soniox/OpenAI APIキーをCloudflare Workers環境変数に設定

---

## Serverless Functions統合 ✅ 完了

### 目的
Cloudflare Workers（Honoフレームワーク）に移行。モジュラーなルート構造に統合。

### 統合マッピング

| 統合前 | 統合後 | ルーティング |
|--------|--------|-------------|
| auth/google.ts, callback.ts, session.ts, me.ts | auth/unified.ts | `?__route=` |
| stripe/checkout.ts, portal.ts | stripe/billing.ts | `?__route=` |
| stripe/success.ts, cancel.ts | stripe/pages.ts | `?__route=` |
| ai/generate.ts, embeddings.ts | ai/unified.ts | `?__route=` |
| stt/token.ts, usage.ts | stt/unified.ts | `?__route=` |
| stripe/webhook.ts | stripe/webhook.ts | 変更なし |
| documents/crud.ts, search.ts | そのまま | 変更なし |
| questions/crud.ts, generate.ts | そのまま | 変更なし |
| subscription.ts | そのまま | 変更なし |
| cron/reset-usage.ts | そのまま | 変更なし |

### 共通ライブラリ抽出
- `lib/routing.ts` - `getRoute()` ヘルパー（5ファイルの重複を解消）
- `lib/validation.ts` - `isValidUUID()` ヘルパー（2ファイルの重複を解消）

### wrangler.toml 設定の注意点
- Honoフレームワークでルーティングを管理
- `wrangler.toml` でWorker設定、環境変数、Cron Triggerを定義
- Worker URL `interview-bot-api.interviewautomaticbot92.workers.dev` でルーティング

### セキュリティ改善
- OAuth `redirectUri` の許可リスト検証を追加（書き込み時 + 読み取り時の二重チェック）
- Embeddings エラーメッセージのサニタイズ（内部情報の漏洩防止）

### DBマイグレーション（006-012）
| マイグレーション | 内容 |
|----------------|------|
| 006_stripe_price_ids.sql | Stripe Price ID設定 |
| 007_interview_questions.sql | 想定質問テーブル |
| 008_consume_auth_session.sql | 認証セッション消費関数 |
| 009_usage_tracking_index.sql | 使用量追跡インデックス |
| 010_ai_generate_proxy.sql | AI生成プロキシ用インデックス |
| 011_security_hardening.sql | セキュリティ強化 |
| 012_question_generation.sql | AI質問生成用設定 |

### 完了条件
- [x] 23関数 → 12関数に統合
- [x] __route クエリパラメータによるルーティング
- [x] 共通ライブラリ抽出（routing.ts, validation.ts）
- [x] wrangler.toml + Hono ルート設定
- [x] Cloudflare Workersデプロイ成功
- [x] 全22エンドポイントの動作確認
- [x] セキュリティ改善（redirectUri検証、エラーサニタイズ）
- [x] Supabaseマイグレーション 006-012 適用

---

## Phase 9以降（将来検討）

| Phase | 機能 | 優先度 |
|-------|------|--------|
| 9.1 | 複数LLM対応（Claude, Gemini） | 高 |
| 9.2 | TTS（音声応答） | 高 |
| 9.3 | Web検索統合 | 中 |
| 9.4 | 面接評価レポート | 中 |
| 9.5 | 自動更新機能 | 低 |
| 9.6 | マルチ言語UI | 低 |
