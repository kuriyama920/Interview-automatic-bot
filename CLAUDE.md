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
| 音声認識 | Soniox v4 RT (WebSocket) |
| 音声キャプチャ | Electron desktopCapturer + setDisplayMediaRequestHandler |
| AI | OpenAI API (gpt-5-nano / gpt-5.4-nano 二段生成) |
| ローカル保存 | electron-store 8.1 (AES暗号化) |

### SaaSバックエンド（Cloudflare Workers）
| カテゴリ | 技術 |
|---------|------|
| API | Cloudflare Workers + Hono 4.12 |
| ランタイム | Workers Runtime (V8 isolates) |
| 認証 | Google OAuth 2.0 + JWT |
| DB | Supabase PostgreSQL + pgvector |
| 決済 | Stripe Checkout (Phase 7) |

## コマンド

```bash
pnpm dev              # 開発サーバー
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー
pnpm test             # テスト実行（Electronアプリ）
pnpm format           # Prettier

# Worker テスト
cd apps/worker && npx vitest run      # Workerユニットテスト

# Stripe E2E テスト
.\scripts\e2e-stripe-test.ps1                        # 非認証テストのみ
.\scripts\e2e-stripe-test.ps1 -JwtToken "eyJhbG..."  # 認証テスト含む
```

## プロジェクト構造

```
src/
├── main/                 # Electronメインプロセス
│   ├── index.ts          # エントリーポイント + Deep Link
│   └── ipc.ts            # IPC通信ハンドラー
├── preload/              # プリロードスクリプト
├── renderer/src/         # Reactアプリ
│   ├── App.tsx           # ルートコンポーネント（ナビゲーション）
│   ├── contexts/         # React Context
│   │   ├── InterviewContext.tsx   # 面接セッション状態管理
│   │   └── NavigationContext.tsx  # ページ遷移管理
│   ├── hooks/            # カスタムフック（14個）
│   │   ├── useAuth.tsx, useSTT.ts, useAudioCapture.ts
│   │   ├── useAIResponse.ts, useProgressiveAI.ts
│   │   ├── useDocuments.ts, useInterviewQuestions.ts
│   │   ├── useConversationHistory.ts, useQuestionCache.ts
│   │   ├── useSubscription.ts, useInterviewProfile.ts
│   │   ├── useDocumentContextCache.ts, useToast.tsx
│   │   └── useLatencyMetrics.ts
│   └── components/       # UIコンポーネント
│       ├── dashboard/    # ダッシュボード（UsageCard等）
│       ├── interview/    # 面接画面（AIResponsePanel等）
│       ├── layout/       # レイアウト（AppShell, Sidebar等）
│       ├── pages/        # ページ（6ページ）
│       └── ui/           # 共通UI（PageHeader, icons等）
├── services/             # 共有サービス（メインプロセス）
│   ├── auth.service.ts
│   ├── stt.service.ts
│   ├── ai.service.ts
│   ├── context.service.ts
│   ├── questions.service.ts
│   ├── session.service.ts    # セッションライフサイクル管理（store: false固定）
│   ├── token-storage.service.ts # トークン保存（electron-store AES暗号化）
│   └── logger.service.ts
└── types/                # 型定義

apps/worker/                # Cloudflare Workers API（Hono）
├── wrangler.toml           # Cloudflare Workers設定
├── src/
│   ├── index.ts            # Honoアプリエントリー + Cronトリガー
│   ├── routes/             # APIルートハンドラー
│   │   ├── auth.ts         # OAuth統合
│   │   ├── ai.ts           # AI統合（generate, embeddings）
│   │   ├── stt.ts          # STT統合（token, usage）
│   │   ├── stripe.ts       # Stripe（checkout, portal, webhook）
│   │   ├── documents.ts    # ドキュメントCRUD + 検索
│   │   ├── questions.ts    # 想定質問CRUD + AI生成
│   │   └── subscription.ts # サブスクリプション管理
│   ├── lib/                # 共有ユーティリティ
│   │   ├── auth.ts         # JWT生成・検証・Google OAuth
│   │   ├── auth-pages.ts   # Pages用認証ヘルパー
│   │   ├── allowed-origins.ts # CORS許可オリジン定義
│   │   ├── usage.ts        # 使用量チェック・記録
│   │   ├── usage-cache.ts  # 使用量キャッシュ
│   │   ├── subscription.ts # Stripe Customer管理・プラン解決
│   │   ├── stripe.ts       # Stripeクライアント
│   │   ├── openai.ts       # OpenAIクライアント
│   │   ├── stt-token.ts    # Soniox一時トークン生成
│   │   ├── prompts.ts      # AIプロンプトテンプレート
│   │   ├── profile.ts      # ユーザープロファイル
│   │   ├── profile-cache.ts # プロファイルキャッシュ
│   │   ├── supabase.ts     # Supabaseクライアント
│   │   ├── validation.ts   # 入力バリデーション
│   │   ├── ai-validation.ts # AI関連バリデーション
│   │   ├── ai-generate.ts  # AI生成ヘルパー
│   │   ├── ai-streaming.ts # SSEストリーミング処理
│   │   ├── embedding-cache.ts # Embeddingキャッシュ
│   │   ├── latency-budget.ts  # レイテンシバジェット管理
│   │   ├── url.ts          # URL関連ユーティリティ
│   │   └── document-parser.ts # ドキュメントパーサー
│   └── middleware/         # Auth + CORS + レート制限ミドルウェア
└── tests/                  # Vitest テスト

docs/
├── PHASE_ROADMAP.md      # Phase 6.5-9 詳細実装計画
├── SETUP.md              # セットアップガイド
├── UI_DESIGN_GUIDELINES.md
├── TECH_STACK.md         # 技術スタック詳細
└── codemaps/             # アーキテクチャ/コードマップ
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
| - | Serverless Functions統合（23→12関数） | ✅ 完了 |
| - | Cloudflare Workers移行（Vercel → Cloudflare） | ✅ 完了 |

> 詳細実装計画: [docs/PHASE_ROADMAP.md](docs/PHASE_ROADMAP.md)

## データフロー

### 音声入力 → STT
```
マイク入力     → getUserMedia()                → AudioContext
システム音声   → setDisplayMediaRequestHandler  → AudioContext (Phase 6.5)
                        ↓ ミキシング
                 ScriptProcessor → PCM 16kHz → Soniox
```

### AI回答生成（Phase 8: プロキシモード + 二段生成）
```
【Speculative Lane（面接官発言中・interim）】
質問 → POST /api/ai/generate-v2 (JWT + SSE, phase=speculative)
    → 使用量チェック → gpt-5-nano (minimal) → SSEストリーミング

【Committed Lane（発言確定後・final）】
質問 → POST /api/ai/generate-v2 (JWT + SSE, phase=committed)
    → 使用量チェック → pgvector RAGコンテキスト取得
    → gpt-5.4-nano → SSEストリーミング → 使用量記録

※ store: false 固定（OpenAIにデータ保存しない）
※ previous_response_id 廃止済み（会話文脈は直近5ターン原文で管理）
※ 将来的にローリングサマリー（/api/ai/summarize）を復活予定
```

### STTフロー（Phase 8: プロキシモード）
```
POST /api/stt/token (JWT) → 使用量チェック → Soniox一時トークン(10分)
    → Electron → Soniox WebSocket (wss://stt-rt.soniox.com) → 音声ストリーミング
    → セッション終了 → POST /api/stt/usage → 使用量記録
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

### コスト構造

> 原価・粗利率・損益分岐点・ユーザー単価などの財務詳細は非公開とし、内部ドキュメントで管理する。
> 使用モデル／音声認識サービスは「技術スタック」表を参照（gpt-5-nano / gpt-5.4-nano 二段生成、Soniox STT）。

## 環境変数

### Electron（.env）
```env
# カスタムキー使用時のみ必要（プロキシモードでは不要）
# SONIOX_API_KEY=xxx
# OPENAI_API_KEY=xxx

# SaaS接続（electron-vite の MAIN_VITE_ プレフィックスが必須。未設定時は本番URLが既定値）
# MAIN_VITE_API_BASE_URL=http://localhost:3000
```

### Cloudflare Workers（wrangler.tomlまたはダッシュボード）
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
JWT_SECRET=xxx
STRIPE_SECRET_KEY=xxx
STRIPE_WEBHOOK_SECRET=xxx
CRON_SECRET=xxx
SONIOX_API_KEY=xxx
OPENAI_API_KEY=xxx
```

## Cloudflare Workersデプロイ設定

### 構成（wrangler.toml）
- `name`: `interview-bot-api`
- `main`: `src/index.ts`
- `compatibility_flags`: `["nodejs_compat"]`
- URL: `interview-bot-api.interviewautomaticbot92.workers.dev`
- Cronトリガー: `0 0 1 * *`（月次使用量リセット）

### デプロイコマンド
```bash
cd apps/worker && npx wrangler deploy    # 本番デプロイ
cd apps/worker && npx wrangler dev       # ローカル開発
```

### ルーティング（Hono）
全APIルートは `src/routes/` 以下にモジュール化。
```typescript
// src/index.ts
const app = new Hono<{ Bindings: Env }>()
app.route('/api/auth', authRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/stt', sttRoutes)
// ...
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
- 音声データは **16kHz, 16bit PCM (pcm_s16le)** でSonioxに送信
- Deep Linkプロトコル: `interview-bot://`
- WSL2環境ではシステム音声キャプチャ不可（Windows側で実行必要）

### セキュリティ
- APIキーはelectron-storeでAES暗号化保存
- JWT認証必須（全APIリクエスト）
- ユーザー入力は必ずバリデーション
- OAuth redirectUri は許可リストで検証（書き込み時 + 読み取り時の二重チェック）
- エラーメッセージは内部情報を含まないようサニタイズ

### コード品質
- 最小カバレッジ: 80%
- Prettier 必須
- コンポーネントは小さく保つ（200-400行）
- イミュータブルパターン使用

## 参考リンク

- [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Soniox Speech AI Docs](https://soniox.com/docs/stt/api-reference/websocket-api)
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns)
