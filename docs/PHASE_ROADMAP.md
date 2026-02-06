# Phase Roadmap - 詳細実装計画

このドキュメントはPhase 6.5以降の詳細な実装計画を記載しています。

---

## Phase 6.5: システム音声キャプチャ（Zoom/Teams対応）

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
              │   Deepgram    │
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
- [ ] setDisplayMediaRequestHandlerでloopback音声有効化
- [ ] 3種類の音声ソース切り替え実装
- [ ] UIで音声ソース選択可能
- [ ] Zoom/Teamsでの動作確認
- [ ] 設定の永続化

---

## Phase 7: Stripe決済 + Webダッシュボード

### 目的
ブラウザでStripe決済を行い、Googleアカウントに紐づけてサブスクリプション管理

### アーキテクチャ
```
Electron [プラン変更] → shell.openExternal() → ブラウザ
  → Webダッシュボード → Google OAuth
  → Stripe Checkout → 決済完了
  → Webhook → Supabase更新
  → Electron APIで最新プラン取得
```

### Stripe設定
1. 商品作成: Pro (¥1,980/月), Enterprise (¥9,800/月)
2. Webhook: checkout.session.completed, customer.subscription.deleted等
3. Customer Portal: プラン変更・解約許可

### APIエンドポイント
| エンドポイント | 機能 |
|---------------|------|
| POST /api/stripe/checkout | Checkout Session作成 |
| POST /api/stripe/webhook | Webhook受信 |
| POST /api/stripe/portal | Customer Portal URL生成 |
| GET /api/subscription | プラン・使用量取得 |

### DBマイグレーション
```sql
ALTER TABLE profiles ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE profiles ADD COLUMN subscription_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN subscription_status TEXT DEFAULT 'active';
```

### 環境変数
```env
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
DASHBOARD_URL=https://dashboard.interview-bot.app
CRON_SECRET=your-cron-secret
```

### 完了条件
- [ ] Stripeアカウント・商品設定
- [ ] /api/stripe/* 実装
- [ ] Webダッシュボード構築
- [ ] 月次リセットCron設定

---

## Phase 8: APIプロキシ

### 目的
Deepgram/OpenAI APIを運用者のキーで実行（ユーザーはAPIキー不要）

### アーキテクチャ
```
Electron → /api/stt/token (JWT) → 一時トークン取得
  → Deepgram WebSocket (一時トークン) → 音声送信
  → 終了時 → /api/stt/usage → 使用量記録
```

### APIエンドポイント
| エンドポイント | 機能 |
|---------------|------|
| POST /api/stt/token | Deepgram一時トークン発行 |
| POST /api/stt/usage | 使用量報告 |
| POST /api/ai/generate | GPT-5ストリーミング |
| POST /api/ai/embeddings | Embeddings生成 |

### Electron変更後
```env
# APIキー不要
API_BASE_URL=https://api.interview-bot.app
```

### セキュリティ
- JWT認証必須
- レート制限（Upstash Redis）
- トークン10分有効期限
- CORS制限

### 完了条件
- [ ] /api/stt/*, /api/ai/* 実装
- [ ] stt.service.ts, ai.service.ts をAPI経由に変更
- [ ] Electron .envからAPIキー削除

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
