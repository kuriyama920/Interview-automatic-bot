# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

リアルタイムAI面接支援デスクトップアプリケーション（Windows対応）。面接中の音声をリアルタイムで文字起こしし、AIが最適な回答を提案します。

## 技術スタック

### デスクトップアプリ（Electron）
- **フレームワーク**: Electron 28.x + React 18
- **ビルドツール**: electron-vite 2.0, Vite 5
- **言語**: TypeScript 5.3
- **スタイリング**: Tailwind CSS 3.4 + DaisyUI 4.6
- **状態管理**: React Hooks (useState, useEffect, useCallback)
- **テスト**: Vitest + Testing Library + Playwright
- **音声認識**: Deepgram SDK 3.4 (WebSocket)
- **AI**: OpenAI API 4.28 (GPT-4o, text-embedding-3-small)
- **ドキュメント解析**: pdf-parse, mammoth, LangChain
- **ローカル保存**: electron-store 8.1 (AES暗号化)

### SaaSバックエンド（Vercel API）
- **API**: Vercel Serverless Functions
- **認証**: Google OAuth 2.0 + JWT
- **データベース**: Supabase PostgreSQL + pgvector
- **決済**: Stripe
- **メール**: Resend

## コマンド

```bash
# 開発
pnpm dev              # 開発サーバー起動

# ビルド
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー作成
pnpm build:portable   # ポータブル版作成

# テスト
pnpm test             # テスト実行
pnpm test:ui          # テストUI表示
pnpm test:coverage    # カバレッジレポート

# コード品質
pnpm lint             # ESLint実行
pnpm lint:fix         # ESLint自動修正
pnpm format           # Prettier実行
```

## プロジェクト構造

```
src/
├── main/                      # Electronメインプロセス
│   ├── index.ts               # エントリーポイント + Deep Link登録
│   └── ipc.ts                 # IPC通信ハンドラー
├── preload/                   # プリロードスクリプト
│   └── index.ts               # Electron API公開 (contextBridge)
├── renderer/                  # Reactアプリ（レンダラープロセス）
│   └── src/
│       ├── App.tsx            # メインコンポーネント + 認証コンテナ
│       ├── main.tsx           # Reactエントリーポイント
│       ├── env.d.ts           # 型定義 (Window.electron)
│       ├── hooks/             # カスタムフック
│       │   ├── useAuth.ts         # 認証状態管理
│       │   ├── useSTT.ts          # STT接続管理
│       │   ├── useAudioCapture.ts # 音声キャプチャ
│       │   ├── useAIResponse.ts   # AI回答生成
│       │   ├── useDocuments.ts    # ドキュメント管理
│       │   └── useSettings.ts     # 設定管理
│       ├── components/        # UIコンポーネント
│       │   ├── LoginPage.tsx          # ログインUI
│       │   ├── DocumentUploadPanel.tsx # ドキュメントアップロード
│       │   ├── SettingsModal.tsx      # 設定モーダル
│       │   └── ErrorBoundary.tsx      # エラーバウンダリ
│       └── utils/
│           └── logger.ts      # レンダラー用ロガー
├── services/                  # 共有サービス（メインプロセス）
│   ├── auth.service.ts        # Google OAuth + JWT管理
│   ├── stt.service.ts         # Deepgram STTサービス
│   ├── ai.service.ts          # OpenAI AIサービス
│   ├── document.service.ts    # PDF/DOCX解析サービス
│   ├── context.service.ts     # コンテキスト管理（RAG）
│   ├── settings.service.ts    # ローカル設定管理
│   └── logger.service.ts      # Winston ロガー
└── types/                     # 共有型定義
    ├── auth.ts                # 認証関連型
    ├── document.ts            # ドキュメント関連型
    └── settings.ts            # 設定関連型

apps/api/                      # Vercel APIプロジェクト（SaaSバックエンド）
├── api/
│   └── auth/
│       ├── google.ts          # OAuth開始エンドポイント
│       ├── callback.ts        # OAuthコールバック
│       └── me.ts              # ユーザー情報取得
├── lib/
│   ├── auth.ts                # OAuth/JWTユーティリティ
│   └── supabase.ts            # Supabaseクライアント
└── supabase/
    └── migrations/            # DBマイグレーション

tests/
├── unit/                      # ユニットテスト
├── integration/               # 統合テスト
└── setup.ts                   # テストセットアップ
```

## アーキテクチャ

### プロセス間通信 (IPC)

```
Renderer Process              Main Process
     │                              │
     │  stt:start                   │
     ├─────────────────────────────►│──► Deepgram WebSocket接続
     │  stt:audio(buffer)           │
     ├─────────────────────────────►│──► 音声データ送信
     │  stt:transcript              │
     │◄─────────────────────────────┤
     │                              │
     │  ai:generateStream(question) │
     ├─────────────────────────────►│──► contextService.getRelevantContext()
     │  ai:chunk / ai:complete      │    ──► aiService.generateStreamResponse()
     │◄─────────────────────────────┤
     │                              │
     │  document:upload(type)       │
     ├─────────────────────────────►│──► ファイル選択ダイアログ
     │                              │    ──► documentService.parseFile()
     │                              │    ──► contextService.addDocument()
     │◄─────────────────────────────┤
```

### データフロー

1. **音声入力**: AudioContext → ScriptProcessor → PCM 16kHz
2. **STT処理**: Main Process → Deepgram WebSocket → 文字起こし結果
3. **コンテキスト検索**: 質問 → OpenAI Embeddings → cosine similarity → 関連チャンク
4. **AI回答生成**: 質問 + コンテキスト → GPT-4o → ストリーミング回答
5. **UI更新**: IPC → Renderer → React State → 画面表示

### コンテキスト管理（RAG）

```
ドキュメント (PDF/DOCX)
     │
     ▼
DocumentService.parseFile()     # テキスト抽出
     │
     ▼
LangChain TextSplitter          # 500文字チャンク化
     │
     ▼
OpenAI Embeddings               # text-embedding-3-small
     │
     ▼
context-data.json               # JSONファイルで永続化
     │
     ▼
cosine similarity検索           # top-3、MIN_SIMILARITY=0.7
```

## 開発フェーズ

| Phase | 内容 | ステータス |
|-------|------|-----------|
| Phase 1 | 音声認識（Deepgram STT） | ✅ 完了 |
| Phase 2 | AI回答生成（OpenAI GPT-4o） | ✅ 完了 |
| Phase 3 | コンテキスト管理（履歴書/求人票解析） | ✅ 完了 |
| Phase 4 | UI/UX改善 | ✅ 完了 |
| Phase 5 | SaaS基盤（認証・DB） | ✅ 完了 |
| Phase 6 | データ同期 | 🔜 次 |
| Phase 7 | Stripe決済 | ⏳ 予定 |
| Phase 8 | APIプロキシ | ⏳ 予定 |

## 環境変数

### Electronアプリ（`.env`）

```env
# 必須: 外部API
DEEPGRAM_API_KEY=your_deepgram_api_key
OPENAI_API_KEY=your_openai_api_key

# SaaS API接続
API_BASE_URL=https://your-api.vercel.app
```

### Vercel API（環境変数設定）

```env
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJxxx

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# JWT
JWT_SECRET=your-jwt-secret-key

# Stripe (Phase 7)
STRIPE_SECRET_KEY=sk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Resend (Phase 7)
RESEND_API_KEY=re_xxx
```

## テスト方針

- 最小カバレッジ目標: 80%
- ユニットテスト: hooks, services
- 統合テスト: IPC通信
- E2Eテスト: 重要なユーザーフロー

## 主要パターン

### サービス層

- シングルトンパターン（export const xxxService = new XxxService()）
- async/await + try/catch
- Winston ロギング
- イミュータブルデータ操作

### React Hooks

- useXxx パターン（useSTT, useAIResponse, useDocuments）
- 状態: data, isLoading, error
- クリーンアップ: useEffect return でリスナー解除

### IPC通信

- ホワイトリスト方式（ALLOWED_INVOKE_CHANNELS）
- contextBridge でAPI公開
- エラーハンドリング: { success: boolean, error?: string, data?: T }

### 認証フロー

```
ログインボタン → auth:loginWithGoogle → shell.openExternal()
    → Google OAuth → /api/auth/callback
    → interview-bot://auth/callback?token=xxx
    → AuthService.handleAuthCallback() → JWT保存
    → auth:stateChanged → UI更新
```

## 注意事項

- パッケージ管理は `pnpm` を使用
- Electronの `ipcMain.handle` / `ipcRenderer.invoke` でIPC通信
- 音声データは16kHz, 16bit PCMでDeepgramに送信
- ロギングはWinston（Main）/ 軽量ロガー（Renderer）を使用
- ファイルサイズ上限: 10MB（PDF/DOCX）
- コンテキストデータは `userData/context-data.json` に保存
- 認証トークンは `electron-store` で暗号化保存
- Deep Linkプロトコル: `interview-bot://` (OAuth コールバック用)
- モノレポ構成: `apps/api/` (Vercel), ルート (Electron)
