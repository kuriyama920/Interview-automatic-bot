# システムアーキテクチャ設計書

Interview Automatic Botの技術アーキテクチャとシステム設計の詳細を記載します。

---

## 目次

1. [システム全体図](#システム全体図)
2. [SaaS インフラ構成](#saas-インフラ構成)
3. [技術スタック詳細](#技術スタック詳細)
4. [データフロー](#データフロー)
5. [認証フロー](#認証フロー)
6. [コンポーネント設計](#コンポーネント設計)
7. [API統合](#api統合)
8. [セキュリティ設計](#セキュリティ設計)
9. [パフォーマンス最適化](#パフォーマンス最適化)
10. [エラーハンドリング](#エラーハンドリング)

---

## システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザー環境                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               オンライン面接ツール                          │   │
│  │          (Zoom / Teams / Google Meet)                   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────┐            │   │
│  │  │    面接官の質問音声                        │            │   │
│  │  └────────────┬─────────────────────────────┘            │   │
│  └───────────────┼──────────────────────────────────────────┘   │
│                  │ マイク入力                                    │
│                  ▼                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Interview Automatic Bot (Electron)              │   │
│  │                                                          │   │
│  │  ┌────────────────┐    ┌────────────────┐               │   │
│  │  │ Main Process   │◄──►│ Renderer       │               │   │
│  │  │                │IPC │ Process (React)│               │   │
│  │  │ ・IPC通信      │    │ ・UI表示        │               │   │
│  │  │ ・ファイル操作  │    │ ・状態管理      │               │   │
│  │  │ ・API通信      │    │ ・ユーザー操作   │               │   │
│  │  └────┬───────────┘    └────────┬───────┘               │   │
│  │       │                         │                       │   │
│  │       │  ┌──────────────────────┴────────┐              │   │
│  │       │  │      Services Layer           │              │   │
│  │       │  │  ・STT Service (Deepgram)     │              │   │
│  │       │  │  ・AI Service (OpenAI)        │              │   │
│  │       │  │  ・Document Service (Parse)   │              │   │
│  │       │  │  ・Context Service (RAG)      │              │   │
│  │       │  │  ・Logger Service (Winston)   │              │   │
│  │       │  └───────────┬───────────────────┘              │   │
│  │       │              │                                  │   │
│  │  ┌────▼──────────────▼────────┐                         │   │
│  │  │   Local Storage            │                         │   │
│  │  │  ・context-data.json       │                         │   │
│  │  │  ・logs/ (Winston)         │                         │   │
│  │  └────────────────────────────┘                         │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │ HTTPS/WebSocket                              │
└─────────────────┼──────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      外部APIサービス                              │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │  Deepgram API   │  │   OpenAI API    │                      │
│  │                 │  │                 │                      │
│  │ ・音声認識       │  │ ・GPT-4o       │                      │
│  │ ・WebSocket接続 │  │ ・Embeddings    │                      │
│  │ ・~300ms遅延   │  │ ・ストリーミング │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## SaaS インフラ構成

Phase 5 で追加された SaaS 基盤のアーキテクチャです。

### システム構成図

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Electron Desktop App (.exe)                   │
│                                                                     │
│  ┌─────────────────────┐     ┌─────────────────────┐               │
│  │   Renderer Process  │◄───►│    Main Process     │               │
│  │   (React + Auth UI) │ IPC │   (AuthService)     │               │
│  └──────────┬──────────┘     └──────────┬──────────┘               │
│             │                           │                          │
│             │   interview-bot://        │                          │
│             │   (Deep Link Protocol)    │                          │
└─────────────┼───────────────────────────┼──────────────────────────┘
              │                           │
              │ HTTPS                     │ HTTPS
              ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Vercel (API Layer)                         │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Serverless Functions                       │   │
│  │                                                               │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │ /api/auth/   │  │ /api/auth/   │  │ /api/auth/   │       │   │
│  │  │   google     │  │   callback   │  │     me       │       │   │
│  │  │              │  │              │  │              │       │   │
│  │  │ OAuth開始    │  │ コールバック  │  │ ユーザー情報 │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Google OAuth   │  │    Supabase     │  │     Stripe      │
│                 │  │                 │  │                 │
│ ・認証プロバイダ │  │ ・PostgreSQL    │  │ ・サブスク管理  │
│ ・ユーザー情報  │  │ ・pgvector      │  │ ・決済処理      │
│                 │  │ ・Row Level     │  │ ・Webhook       │
│                 │  │   Security      │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### 技術スタック（SaaS 基盤）

| レイヤー | 技術 | 用途 |
|---------|------|------|
| **認証** | Google OAuth 2.0 | シングルサインオン |
| **トークン** | JWT (jsonwebtoken) | セッション管理 |
| **API** | Vercel Serverless Functions | バックエンドAPI |
| **データベース** | Supabase PostgreSQL | ユーザー・設定・使用量データ |
| **ベクトル検索** | pgvector | ドキュメント埋め込み（1536次元） |
| **決済** | Stripe | サブスクリプション管理 |
| **メール** | Resend | トランザクションメール |
| **Deep Link** | Electron Protocol | OAuth コールバック |

### サブスクリプションプラン

| 機能 | Free | Pro (¥1,980/月) | Enterprise (¥9,800/月) |
|------|------|-----------------|----------------------|
| STT認識時間 | 60分/月 | 600分/月 | 無制限 |
| AI生成トークン | 50,000/月 | 500,000/月 | 無制限 |
| ストレージ | 50MB | 1GB | 無制限 |
| ドキュメント数 | 5件 | 50件 | 無制限 |
| カスタムAPIキー | - | ✓ | ✓ |
| オフラインモード | ✓ | ✓ | ✓ |

### データベーススキーマ

```sql
-- 主要テーブル
profiles          -- ユーザー情報 + Stripe連携 + 使用量
user_settings     -- アプリ設定（クラウド同期）
documents         -- ドキュメントメタデータ
document_chunks   -- ベクトル埋め込み (pgvector)
usage_logs        -- 使用量追跡
subscription_plans -- プラン定義（マスター）
```

### ファイル構成（SaaS 関連）

```
apps/api/                           # Vercel API プロジェクト
├── package.json                    # 依存関係
├── vercel.json                     # デプロイ設定
├── tsconfig.json                   # TypeScript設定
├── lib/
│   ├── supabase.ts                 # Supabaseクライアント
│   └── auth.ts                     # OAuth/JWT ユーティリティ
├── api/
│   └── auth/
│       ├── google.ts               # OAuth開始エンドポイント
│       ├── callback.ts             # OAuthコールバック
│       └── me.ts                   # ユーザー情報取得
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql  # DBスキーマ

src/
├── types/
│   └── auth.ts                     # 認証型定義
├── services/
│   └── auth.service.ts             # Electron側認証サービス
└── renderer/src/
    ├── hooks/
    │   └── useAuth.ts              # 認証フック
    └── components/
        └── LoginPage.tsx           # ログインUI
```

---

## 技術スタック詳細

### フロントエンド（Renderer Process）

| 技術 | バージョン | 用途 |
|------|----------|------|
| **React** | 18.2.0 | UIフレームワーク |
| **TypeScript** | 5.3.0 | 型安全な開発 |
| **Tailwind CSS** | 3.4.0 | ユーティリティファーストCSS |
| **DaisyUI** | 4.6.0 | UIコンポーネントライブラリ |

### バックエンド（Main Process）

| 技術 | バージョン | 用途 |
|------|----------|------|
| **Electron** | 28.3.3 | デスクトップアプリフレームワーク |
| **Node.js** | 18.x LTS | ランタイム |
| **TypeScript** | 5.3.0 | 型安全な開発 |

### サービス層（Electron）

| サービス | ライブラリ | 用途 |
|---------|-----------|------|
| **音声認識** | @deepgram/sdk 3.4.0 | リアルタイムSTT |
| **AI** | openai 4.28.0 | GPT-4o回答生成、Embeddings |
| **PDF解析** | pdf-parse 1.1.1 | 履歴書テキスト抽出 |
| **DOCX解析** | mammoth 1.6.0 | Word文書解析 |
| **テキスト分割** | langchain 0.1.0 | RecursiveCharacterTextSplitter |
| **ローカル保存** | electron-store 8.1.0 | 暗号化設定保存 |
| **ログ** | winston 3.11.0 | 構造化ログ出力 |

### SaaS バックエンド（Vercel API）

| サービス | ライブラリ | 用途 |
|---------|-----------|------|
| **API** | @vercel/node | Serverless Functions |
| **データベース** | @supabase/supabase-js 2.39.0 | PostgreSQL + pgvector |
| **認証** | jsonwebtoken | JWT生成・検証 |
| **決済** | stripe 14.14.0 | サブスクリプション管理 |
| **メール** | resend 2.1.0 | トランザクションメール |

### 外部サービス

| サービス | 用途 | 特徴 |
|---------|------|------|
| **Google OAuth** | 認証プロバイダ | Gmail SSO |
| **Supabase** | BaaS | PostgreSQL + pgvector + RLS |
| **Stripe** | 決済 | サブスクリプション・Webhook |
| **Vercel** | ホスティング | Serverless Functions |
| **Resend** | メール | トランザクションメール |

### 開発ツール

| ツール | 用途 |
|--------|------|
| **Electron Vite** | 高速ビルド・HMR |
| **ESLint** | コード品質チェック |
| **Prettier** | コードフォーマット |
| **Vitest** | 単体テスト |
| **Playwright** | E2Eテスト |
| **electron-builder** | Windows .exe生成 |

---

## データフロー

### 1. 音声認識フロー

```
┌──────────────┐
│ マイク入力    │ AudioContext API
└──────┬───────┘
       │ ①キャプチャ（Renderer）
       ▼
┌──────────────────┐
│ useAudioCapture  │ ScriptProcessorNode
└──────┬───────────┘
       │ ②PCM 16kHz変換
       ▼
┌──────────────────┐
│ IPC: stt:audio   │ ArrayBuffer送信
└──────┬───────────┘
       │ ③Main Processへ
       ▼
┌──────────────────┐
│ STTService       │ src/services/stt.service.ts
└──────┬───────────┘
       │ ④WebSocket送信
       ▼
┌──────────────────┐
│ Deepgram API     │ 外部サービス
└──────┬───────────┘
       │ ⑤JSON応答 (100-300ms)
       ▼
┌──────────────────┐
│ IPC: stt:transcript│ Main → Renderer
└──────┬───────────┘
       │ ⑥Event
       ▼
┌──────────────────┐
│ useSTT Hook      │ React State更新
└──────────────────┘
       │ ⑦UI更新
       ▼
   [文字起こし表示]
```

### 2. AI回答生成フロー

```
┌──────────────────┐
│ 質問テキスト      │ transcripts配列
└──────┬───────────┘
       │ ①AI生成リクエスト
       ▼
┌──────────────────┐
│ IPC: ai:generateStream │
└──────┬───────────┘
       │ ②Main Processへ
       ▼
┌──────────────────┐
│ ContextService   │ コンテキスト検索（オプション）
│ .getRelevantContext() │
└──────┬───────────┘
       │ ③関連チャンク取得
       ▼
┌──────────────────┐
│ AIService        │ src/services/ai.service.ts
│ .generateStreamResponse() │
└──────┬───────────┘
       │ ④OpenAI API呼び出し
       ▼
┌──────────────────┐
│ OpenAI API       │ ストリーミング応答
└──────┬───────────┘
       │ ⑤トークンごとに返信
       ▼
┌──────────────────┐
│ IPC: ai:chunk    │ 逐次送信
└──────┬───────────┘
       │ ⑥Rendererへ
       ▼
┌──────────────────┐
│ useAIResponse    │ streamingText更新
└──────────────────┘
       │ ⑦リアルタイム表示
       ▼
   [AI回答表示]
```

### 3. ドキュメント処理フロー（RAG）

```
┌──────────────────┐
│ PDF/DOCX ファイル │ ユーザーアップロード
└──────┬───────────┘
       │ ①ファイル選択
       ▼
┌──────────────────┐
│ IPC: document:upload │
│ (type: 'resume' | 'job_posting') │
└──────┬───────────┘
       │ ②Main Processへ
       ▼
┌──────────────────┐
│ dialog.showOpenDialog │ ファイル選択ダイアログ
└──────┬───────────┘
       │ ③ファイルパス取得
       ▼
┌──────────────────┐
│ ファイルサイズチェック │ MAX: 10MB
└──────┬───────────┘
       │ ④バリデーション
       ▼
┌──────────────────┐
│ DocumentService  │ src/services/document.service.ts
│ .parseFile()     │
└──────┬───────────┘
       │ ⑤テキスト抽出（pdf-parse/mammoth）
       ▼
┌──────────────────┐
│ DocumentService  │
│ .chunkText()     │
└──────┬───────────┘
       │ ⑥チャンク化（500文字、50オーバーラップ）
       ▼
┌──────────────────┐
│ ContextService   │ src/services/context.service.ts
│ .addDocument()   │
└──────┬───────────┘
       │ ⑦Embeddings生成（バッチ: 20）
       ▼
┌──────────────────┐
│ OpenAI Embeddings │ text-embedding-3-small
└──────┬───────────┘
       │ ⑧ベクトル生成
       ▼
┌──────────────────┐
│ context-data.json │ userData領域に永続化
└──────────────────┘
```

### 4. コンテキスト検索フロー

```
┌──────────────────┐
│ 質問テキスト      │ "あなたの強みは？"
└──────┬───────────┘
       │ ①クエリ
       ▼
┌──────────────────┐
│ OpenAI Embeddings │ クエリをベクトル化
└──────┬───────────┘
       │ ②クエリベクトル
       ▼
┌──────────────────┐
│ ContextService   │ cosine similarity計算
│ .getRelevantContext() │
└──────┬───────────┘
       │ ③類似度でソート
       │   (MIN_SIMILARITY=0.7, TOP_K=3)
       ▼
┌──────────────────┐
│ 関連チャンク      │ ドキュメントタイプ別にグループ化
└──────┬───────────┘
       │ ④コンテキスト文字列生成
       ▼
┌──────────────────┐
│ AIService        │ プロンプトに組み込み
└──────────────────┘
```

### 5. Google OAuth 認証フロー

```
┌──────────────────┐
│ ログインボタン    │ LoginPage.tsx
└──────┬───────────┘
       │ ①クリック
       ▼
┌──────────────────┐
│ IPC: auth:loginWithGoogle │
└──────┬───────────┘
       │ ②Main Processへ
       ▼
┌──────────────────┐
│ AuthService      │ src/services/auth.service.ts
│ .startGoogleLogin() │
└──────┬───────────┘
       │ ③外部ブラウザ起動
       ▼
┌──────────────────┐
│ shell.openExternal() │
│ → /api/auth/google │
└──────┬───────────┘
       │ ④リダイレクト
       ▼
┌──────────────────┐
│ Google OAuth     │ accounts.google.com
│ 同意画面         │
└──────┬───────────┘
       │ ⑤承認後リダイレクト
       ▼
┌──────────────────┐
│ Vercel API       │ /api/auth/callback
│ コールバック      │
└──────┬───────────┘
       │ ⑥トークン交換 → JWT生成
       ▼
┌──────────────────┐
│ Deep Link        │ interview-bot://auth/callback?token=xxx
└──────┬───────────┘
       │ ⑦Electronがキャッチ
       ▼
┌──────────────────┐
│ AuthService      │
│ .handleAuthCallback() │
└──────┬───────────┘
       │ ⑧JWT保存 → ユーザー情報取得
       ▼
┌──────────────────┐
│ electron-store   │ 暗号化保存
│ (auth.json)      │
└──────┬───────────┘
       │ ⑨IPC通知
       ▼
┌──────────────────┐
│ auth:stateChanged │ Renderer通知
└──────┬───────────┘
       │ ⑩UI更新
       ▼
   [メイン画面表示]
```

### 認証関連の技術詳細

| 項目 | 技術/仕様 |
|------|---------|
| **OAuth プロバイダ** | Google OAuth 2.0 |
| **スコープ** | openid, email, profile |
| **トークン形式** | JWT (HS256) |
| **トークン有効期限** | 7日間 |
| **保存方法** | electron-store (AES暗号化) |
| **Deep Link Protocol** | `interview-bot://` |
| **CSRF対策** | stateパラメータ検証 |

---

## コンポーネント設計

### Electronプロセス構成

```
Main Process (Node.js)
├── src/main/index.ts        エントリーポイント + Deep Link登録
├── src/main/ipc.ts          IPC通信ハンドラ
│   │
│   ├── 認証関連
│   │   ├── handle('auth:getState')
│   │   ├── handle('auth:loginWithGoogle')
│   │   ├── handle('auth:validate')
│   │   ├── handle('auth:logout')
│   │   └── handle('auth:getToken')
│   │
│   ├── 設定関連
│   │   ├── handle('config:getApiKey')
│   │   ├── handle('settings:get')
│   │   ├── handle('settings:save')
│   │   └── handle('settings:reset')
│   │
│   ├── 音声認識
│   │   ├── handle('stt:start')
│   │   ├── handle('stt:stop')
│   │   └── on('stt:audio')
│   │
│   ├── AI生成
│   │   ├── handle('ai:init')
│   │   └── handle('ai:generateStream')
│   │
│   └── ドキュメント
│       ├── handle('context:init')
│       ├── handle('document:upload')
│       ├── handle('document:list')
│       └── handle('document:remove')
│
└── src/services/            サービス層
    ├── auth.service.ts      Google OAuth + JWT管理
    ├── stt.service.ts       Deepgram WebSocket管理
    ├── ai.service.ts        OpenAI Chat/Embeddings
    ├── document.service.ts  PDF/DOCX解析
    ├── context.service.ts   RAGコンテキスト管理
    ├── settings.service.ts  ローカル設定管理
    └── logger.service.ts    Winston ロガー

Preload Script
└── src/preload/index.ts     コンテキストブリッジ
    └── contextBridge.exposeInMainWorld('electron', {...})
        ├── auth.*           認証API
        ├── config.*         設定API
        ├── stt.*            音声認識API
        ├── ai.*             AI生成API
        ├── document.*       ドキュメントAPI
        └── settings.*       設定API

Renderer Process (React)
└── src/renderer/src/
    ├── App.tsx              ルートコンポーネント + 認証コンテナ
    ├── main.tsx             Reactエントリーポイント
    ├── env.d.ts             Window.electron型定義
    ├── hooks/               カスタムフック
    │   ├── useAuth.ts       認証状態管理
    │   ├── useSTT.ts        STT接続・文字起こし管理
    │   ├── useAudioCapture.ts  AudioContext管理
    │   ├── useAIResponse.ts    AI回答生成管理
    │   ├── useDocuments.ts     ドキュメント管理
    │   └── useSettings.ts      設定管理
    └── components/          UIコンポーネント
        ├── LoginPage.tsx        ログインUI
        ├── DocumentUploadPanel.tsx
        └── ErrorBoundary.tsx
```

### React コンポーネント階層

```
App
├── ヘッダー
│   ├── タイトル "Interview Bot"
│   └── フェーズバッジ (Phase 1-3)
│
├── コントロールパネル
│   ├── 接続状態バッジ
│   ├── 録音状態バッジ
│   ├── 録音開始/停止ボタン
│   ├── 音声ファイルテストボタン
│   ├── AI回答生成ボタン
│   ├── クリアボタン
│   └── 自動生成トグル
│
├── WSL2警告メッセージ
│
├── エラー表示
│
└── メインコンテンツ (3カラム)
    ├── DocumentUploadPanel (左)
    │   ├── 履歴書アップロードボタン
    │   ├── 求人票アップロードボタン
    │   └── ドキュメント一覧
    │       └── DocumentItem[]
    │           ├── ファイル名
    │           ├── チャンク数
    │           └── 削除ボタン
    │
    ├── 文字起こし結果 (中央)
    │   ├── 確定テキスト一覧
    │   └── 現在の認識中テキスト
    │
    └── AI推奨回答 (右)
        ├── 回答例
        ├── 補足ポイント
        └── 信頼度
```

---

## API統合

### Deepgram API

**エンドポイント**: `wss://api.deepgram.com/v1/listen`

**認証**: APIキーをAuthorizationヘッダーで送信

**パラメータ**:
```typescript
{
  model: 'nova-2',           // 最新モデル
  language: 'ja',            // 日本語
  smart_format: true,        // 句読点自動挿入
  interim_results: true,     // 途中結果も返す
  utterance_end_ms: 1000,    // 発話終了判定（1秒）
  vad_events: true,          // 音声検出イベント
}
```

**応答形式**:
```json
{
  "channel": {
    "alternatives": [
      {
        "transcript": "あなたの強みは何ですか",
        "confidence": 0.98
      }
    ]
  },
  "is_final": true,
  "speech_final": true
}
```

**コスト**: $0.0043/分

---

### OpenAI API

#### Chat Completions

**エンドポイント**: `https://api.openai.com/v1/chat/completions`

**ストリーミングリクエスト**:
```typescript
{
  model: 'gpt-4o',
  messages: [
    {
      role: 'system',
      content: 'あなたは面接の回答アシスタントです...'
    },
    {
      role: 'user',
      content: 'あなたの強みは何ですか？'
    }
  ],
  temperature: 0.7,
  max_tokens: 1000,
  stream: true
}
```

**ストリーミング応答**:
```
data: {"choices":[{"delta":{"content":"私"}}]}
data: {"choices":[{"delta":{"content":"の"}}]}
data: {"choices":[{"delta":{"content":"強み"}}]}
data: [DONE]
```

#### Embeddings

**エンドポイント**: `https://api.openai.com/v1/embeddings`

**リクエスト**:
```typescript
{
  model: 'text-embedding-3-small',
  input: ['チャンク1のテキスト', 'チャンク2のテキスト', ...]
}
```

**コスト**:
- GPT-4o: $0.005/1k tokens (入力), $0.015/1k tokens (出力)
- Embeddings: $0.00002/1k tokens

---

## セキュリティ設計

### 1. APIキー保護

```typescript
// 環境変数から取得（.envファイル）
const apiKey = process.env.DEEPGRAM_API_KEY
const openaiKey = process.env.OPENAI_API_KEY
```

**対策**:
- APIキーはレンダラープロセスに渡さない
- メインプロセスでのみ管理
- `.env`ファイルは`.gitignore`に追加

### 2. プロセス分離

```typescript
// src/preload/index.ts - コンテキストブリッジ
import { contextBridge, ipcRenderer } from 'electron'

// 許可するチャンネルをホワイトリスト化
const ALLOWED_INVOKE_CHANNELS = [
  'config:getApiKey',
  'stt:start',
  'stt:stop',
  'stt:status',
  'ai:init',
  'ai:generateStream',
  'ai:status',
  'context:init',
  'document:upload',
  'document:list',
  'document:remove',
]

contextBridge.exposeInMainWorld('electron', {
  // 許可されたAPIのみ公開
})
```

### 3. 入力検証

```typescript
// ファイルサイズ上限チェック
const MAX_FILE_SIZE = 10 * 1024 * 1024  // 10MB
const stats = await fs.stat(filePath)
if (stats.size > MAX_FILE_SIZE) {
  return { success: false, error: 'ファイルサイズは10MB以下にしてください' }
}

// 拡張子チェック
const ext = path.extname(filePath).toLowerCase()
if (ext !== '.pdf' && ext !== '.docx') {
  return { success: false, error: 'PDFまたはDOCXファイルのみ対応しています' }
}
```

### 4. 通信セキュリティ

- すべての外部API通信はHTTPS/WSS
- 証明書検証有効

---

## パフォーマンス最適化

### 1. 音声ストリーミング最適化

```typescript
// チャンクサイズ: 4096 samples
const CHUNK_SIZE = 4096
const SAMPLE_RATE = 16000

// ScriptProcessorNodeでバッファリング
processor.onaudioprocess = (e) => {
  const inputData = e.inputBuffer.getChannelData(0)
  // 16kHz, 16bit PCMに変換して送信
}
```

### 2. Embeddings バッチ処理

```typescript
// バッチサイズ: 20チャンク
const batchSize = 20

for (let i = 0; i < chunks.length; i += batchSize) {
  const batch = chunks.slice(i, i + batchSize)
  const response = await this.client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: batch.map(c => c.content),
  })

  // レート制限対策
  if (i + batchSize < chunks.length) {
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
```

### 3. コンテキスト検索最適化

```typescript
// O(1) ルックアップのためにMapを使用
const metadataMap = new Map(this.data.metadata.map(m => [m.id, m]))

// 類似度計算は並列化可能
const results = chunks
  .map(chunk => ({
    chunk,
    similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
  }))
  .filter(r => r.similarity >= MIN_SIMILARITY)
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, TOP_K)
```

### 4. Write Lock パターン

```typescript
// 同時書き込み防止
private writeLock: Promise<void> = Promise.resolve()

async addDocument(...) {
  const operation = async () => { /* ... */ }

  this.writeLock = this.writeLock.then(operation).catch(error => {
    throw error
  })

  await this.writeLock
}
```

---

## エラーハンドリング

### 1. IPC通信パターン

```typescript
// 統一されたレスポンス形式
interface IPCResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ハンドラー実装
ipcMain.handle('xxx:action', async (_event, param) => {
  try {
    const result = await xxxService.action(param)
    return { success: true, data: result }
  } catch (error) {
    log.error('Action failed', { error: String(error) })
    return { success: false, error: String(error) }
  }
})
```

### 2. React Hook エラー状態

```typescript
export function useXxx() {
  const [error, setError] = useState<string | null>(null)

  const doAction = useCallback(async () => {
    setError(null)
    try {
      const result = await window.electron.xxx.action()
      if (!result.success) {
        setError(result.error || 'Unknown error')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [])

  return { error, doAction }
}
```

### 3. ゼロベクトル対策

```typescript
private cosineSimilarity(a: number[], b: number[]): number {
  // ...計算...

  // ゼロベクトルでNaNを防止
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) {
    return 0
  }

  return dotProduct / denominator
}
```

### 4. ログ出力

```typescript
import { createLogger } from './services/logger.service'
const log = createLogger('context-service')

// 構造化ログ
log.info('Document added', { id: metadata.id, chunks: chunks.length })
log.error('Failed to generate embeddings', { error: String(error) })
log.debug('Context retrieved', { resultCount: groupedResults.size })
```

---

## まとめ

このアーキテクチャは以下を実現します：

- **低遅延**: 音声認識100-300ms、LLM応答2秒以内
- **高セキュリティ**: APIキー保護、プロセス分離、入力検証
- **スケーラブル**: モジュラー設計、サービス層分離
- **保守性**: TypeScript、テスト、構造化ログ
- **ユーザビリティ**: ストリーミングUI、エラーハンドリング

---

**最終更新**: 2026-02-06
