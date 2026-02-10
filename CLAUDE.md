# CLAUDE.md

Claude Codeがこのリポジトリで作業する際のガイダンス。

## プロジェクト概要

リアルタイムAI面接支援デスクトップアプリ（Windows対応）。音声をリアルタイム文字起こしし、AIが最適な回答を提案。

## 技術スタック

### Electron デスクトップ
| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Electron 28.x + React 18 |
| ビルド | electron-vite 2.0, Vite 5 |
| 言語 | TypeScript 5.3 |
| スタイル | Tailwind CSS 3.4 + DaisyUI 4.6 |
| 音声認識 | Deepgram SDK 3.4 (WebSocket) |
| 音声キャプチャ | Electron desktopCapturer + setDisplayMediaRequestHandler |
| AI | OpenAI API 4.28 (GPT-5 Mini) |
| ローカル保存 | electron-store 8.1 (AES暗号化) |

### SaaSバックエンド（Vercel）
| カテゴリ | 技術 |
|---------|------|
| API | Vercel Serverless Functions |
| 認証 | Google OAuth 2.0 + JWT |
| DB | Supabase PostgreSQL + pgvector |
| 決済 | Stripe Checkout (Phase 7) |

## コマンド

```bash
pnpm dev              # 開発サーバー
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー
pnpm test             # テスト実行
pnpm lint             # ESLint
pnpm format           # Prettier
```

## プロジェクト構造

```
src/
├── main/                 # Electronメインプロセス
│   ├── index.ts          # エントリーポイント + Deep Link
│   └── ipc.ts            # IPC通信ハンドラー
├── preload/              # プリロードスクリプト
├── renderer/src/         # Reactアプリ
│   ├── App.tsx           # メインコンポーネント
│   ├── hooks/            # カスタムフック
│   │   ├── useAuth.ts
│   │   ├── useSTT.ts
│   │   ├── useAudioCapture.ts
│   │   ├── useAIResponse.ts
│   │   └── useDocuments.ts
│   └── components/       # UIコンポーネント
├── services/             # 共有サービス（メインプロセス）
│   ├── auth.service.ts
│   ├── stt.service.ts
│   ├── ai.service.ts
│   └── context.service.ts
└── types/                # 型定義

apps/api/                 # Vercel API
├── api/
│   ├── auth/             # OAuth
│   ├── documents/        # ドキュメントCRUD + 検索
│   ├── stripe/           # Checkout, Webhook, Portal
│   ├── cron/             # 月次使用量リセット
│   ├── subscription.ts   # プラン・使用量取得
│   ├── stt/              # Phase 8: STTトークン発行 + 使用量報告
│   └── ai/               # Phase 8: AI生成プロキシ + Embeddings
└── lib/                  # ユーティリティ (auth, cors, supabase, stripe, subscription, usage, deepgram)

docs/
├── PHASE_ROADMAP.md      # Phase 6.5-9 詳細実装計画
└── UI_DESIGN_GUIDELINES.md
```

## 開発フェーズ

| Phase | 内容 | ステータス |
|-------|------|-----------|
| 1-4 | 音声認識・AI回答・コンテキスト・UI | ✅ 完了 |
| 5 | SaaS基盤（認証・DB） | ✅ 完了 |
| 6 | クラウドRAG（pgvector） | ✅ 完了 |
| 6.5 | システム音声キャプチャ | ✅ 完了 |
| 7 | Stripe決済 + サブスクリプション管理 | ✅ 完了 |
| 8 | APIプロキシ（ユーザーAPIキー不要） | ✅ 完了 |

> 詳細実装計画: [docs/PHASE_ROADMAP.md](docs/PHASE_ROADMAP.md)

## データフロー

### 音声入力 → STT
```
マイク入力     → getUserMedia()                → AudioContext
システム音声   → setDisplayMediaRequestHandler  → AudioContext (Phase 6.5)
                        ↓ ミキシング
                 ScriptProcessor → PCM 16kHz → Deepgram
```

### AI回答生成（Phase 8: プロキシモード）
```
質問 → POST /api/ai/generate (JWT + SSE)
    → 使用量チェック → pgvector RAGコンテキスト取得
    → OpenAI GPT-5 Mini → SSEストリーミング → 使用量記録
（カスタムキー時は直接OpenAI API接続）
```

### STTフロー（Phase 8: プロキシモード）
```
POST /api/stt/token (JWT) → 使用量チェック → Deepgram一時トークン(10分)
    → Electron → Deepgram WebSocket (一時トークン) → 音声ストリーミング
    → セッション終了 → POST /api/stt/usage → 使用量記録
（カスタムキー時は直接Deepgram接続、使用量報告なし）
```

### 認証フロー
```
ログインボタン → shell.openExternal() → Google OAuth
    → /api/auth/callback → interview-bot://auth/callback?token=xxx
    → AuthService.handleAuthCallback() → JWT保存
```

## ビジネスモデル

| プラン | 月額 | STT | AIトークン | ドキュメント |
|--------|------|-----|-----------|-------------|
| Free | ¥0 | 30分 | 30,000 | 3件 |
| Pro | ¥2,980 | 600分 | 500,000 | 50件 |
| Max | ¥14,800 | 3,000分 | 5,000,000 | 200件 |

### コスト構造（2026年2月時点）

主要コスト: Deepgram STT ¥1.16/分, GPT-5 Mini 入力$0.25/出力$2.00 per 1Mトークン
- Free: 最大¥39/ユーザー（赤字だが体験用として許容）
- Pro: 粗利率70%（¥2,079/ユーザー）
- Max: 粗利率68%（¥10,059/ユーザー）、上限ありで赤字リスク排除
- 固定費: Supabase Pro ¥3,750 + Vercel Pro ¥3,000 = ¥6,750/月
- 損益分岐点: Pro 約4人で固定費回収

## 環境変数

### Electron（.env）
```env
# カスタムキー使用時のみ必要（プロキシモードでは不要）
# DEEPGRAM_API_KEY=xxx
# OPENAI_API_KEY=xxx

# SaaS接続
API_BASE_URL=https://api-kuriyama-natos-projects.vercel.app
```

### Vercel API
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
JWT_SECRET=xxx
# Phase 7-8
STRIPE_SECRET_KEY=xxx
DEEPGRAM_API_KEY=xxx
OPENAI_API_KEY=xxx
```

## 主要パターン

### IPC通信
```typescript
// メインプロセス
ipcMain.handle('channel:action', async (_, data) => {
  return { success: true, data: result }
})

// レンダラー
const result = await window.electron.channel.action(data)
```

### サービス層
- シングルトン（export const xxxService = new XxxService()）
- async/await + try/catch
- Winston ロギング

### React Hooks
- useXxx パターン
- 状態: data, isLoading, error
- クリーンアップ: useEffect return でリスナー解除

## 注意事項

### 重要
- パッケージ管理は **pnpm** を使用
- 音声データは **16kHz, 16bit PCM** でDeepgramに送信
- Deep Linkプロトコル: `interview-bot://`
- WSL2環境ではシステム音声キャプチャ不可（Windows側で実行必要）

### セキュリティ
- APIキーはelectron-storeでAES暗号化保存
- JWT認証必須（全APIリクエスト）
- ユーザー入力は必ずバリデーション

### コード品質
- 最小カバレッジ: 80%
- ESLint + Prettier 必須
- コンポーネントは小さく保つ（200-400行）
- イミュータブルパターン使用

## 参考リンク

- [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Deepgram SDK](https://developers.deepgram.com/)
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns)
