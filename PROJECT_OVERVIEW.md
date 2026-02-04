# プロジェクト概要 - Interview Automatic Bot

このドキュメントは、プロジェクト全体の概要と現在の実装状況をまとめています。

---

## 📚 ドキュメント一覧

### メインドキュメント

| ファイル | 内容 | 読むべきタイミング |
|---------|------|-------------------|
| **[README.md](./README.md)** | プロジェクト概要、機能説明、セットアップ手順 | 最初に読む |
| **[DEVELOPMENT.md](./DEVELOPMENT.md)** | 詳細な開発ワークフロー、Phase別実装ガイド | 実装時 |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | システムアーキテクチャ、データフロー、技術設計 | 設計確認時 |
| **[CLAUDE.md](./CLAUDE.md)** | Claude Code用ガイダンス | AI開発支援時 |

### セットアップ関連

| ファイル | 内容 |
|---------|------|
| **[docs/SETUP.md](./docs/SETUP.md)** | 開発環境構築の詳細手順 |
| **[.env.example](./.env.example)** | 環境変数テンプレート |
| **[package.json](./package.json)** | 依存関係・スクリプト定義 |

---

## 🎯 プロジェクト要約

### 何を作るのか？

**Windows向けデスクトップアプリケーション**で、以下を実現します：

```
オンライン面接中の音声 → リアルタイム認識 → AI回答生成 → 画面表示
```

### なぜデスクトップアプリなのか？

Webブラウザでは以下が**技術的に不可能**です：
- ✅ システム音声キャプチャ（Zoom/Teamsの音声を取得）
- ✅ 透明オーバーレイ（画面共有に映らない）
- ✅ グローバルホットキー（アプリ外でも動作）

### 主要技術スタック

```yaml
フレームワーク: Electron 28.x
言語: TypeScript 5.3
UI: React 18 + Tailwind CSS + DaisyUI
状態管理: React Hooks（カスタムフック）
音声認識: Deepgram API（WebSocket、100-300ms遅延）
LLM: OpenAI GPT-4o（ストリーミング対応）
RAG: OpenAI Embeddings + JSON永続化（インメモリ検索）
ドキュメント解析: pdf-parse, mammoth, LangChain
```

---

## 📊 実装状況

### Phase別進捗

| Phase | 内容 | ステータス | 主要ファイル |
|-------|------|-----------|-------------|
| Phase 1 | 音声認識（Deepgram STT） | ✅ 完了 | stt.service.ts, useSTT.ts |
| Phase 2 | AI回答生成（OpenAI GPT-4o） | ✅ 完了 | ai.service.ts, useAIResponse.ts |
| Phase 3 | コンテキスト管理（RAG） | ✅ 完了 | document.service.ts, context.service.ts |
| Phase 4 | UI/UX改善 | 🔜 次 | App.tsx, components/ |

### 実装済み機能

#### Phase 1: 音声認識
- ✅ Deepgram WebSocket接続
- ✅ リアルタイム文字起こし（interim + final）
- ✅ 16kHz PCM音声キャプチャ
- ✅ 音声ファイルテスト機能（WSL2対応）

#### Phase 2: AI回答生成
- ✅ OpenAI GPT-4oストリーミング
- ✅ 面接回答特化システムプロンプト
- ✅ リアルタイムレスポンス表示

#### Phase 3: コンテキスト管理
- ✅ PDF/DOCXファイル解析
- ✅ テキストチャンク化（500文字）
- ✅ OpenAI Embeddings生成
- ✅ JSON永続化（userData/context-data.json）
- ✅ Cosine類似度検索（top-3）
- ✅ AIへの自動コンテキスト統合

---

## 🗂️ プロジェクト構造

```
interview-automatic-bot/
├── README.md                    # プロジェクト概要
├── DEVELOPMENT.md               # 開発ガイド
├── ARCHITECTURE.md              # アーキテクチャ設計
├── CLAUDE.md                    # Claude Code用ガイダンス
├── PROJECT_OVERVIEW.md          # このファイル
├── package.json                 # 依存関係・スクリプト
├── .env.example                 # 環境変数テンプレート
├── electron.vite.config.ts      # ビルド設定
├── tsconfig.json                # TypeScript設定
│
├── src/
│   ├── main/                    # Electronメインプロセス
│   │   ├── index.ts             # エントリーポイント
│   │   └── ipc.ts               # IPC通信ハンドラー
│   │
│   ├── preload/                 # プリロードスクリプト
│   │   └── index.ts             # contextBridge API公開
│   │
│   ├── renderer/                # React UI（レンダラープロセス）
│   │   └── src/
│   │       ├── App.tsx          # メインコンポーネント
│   │       ├── hooks/           # カスタムフック
│   │       │   ├── useSTT.ts           # STT接続管理
│   │       │   ├── useAudioCapture.ts  # 音声キャプチャ
│   │       │   ├── useAIResponse.ts    # AI回答生成
│   │       │   └── useDocuments.ts     # ドキュメント管理
│   │       └── components/      # UIコンポーネント
│   │           └── DocumentUploadPanel.tsx
│   │
│   ├── services/                # ビジネスロジック（メインプロセス）
│   │   ├── stt.service.ts       # Deepgram統合
│   │   ├── ai.service.ts        # OpenAI統合
│   │   ├── document.service.ts  # PDF/DOCX解析
│   │   ├── context.service.ts   # RAGコンテキスト管理
│   │   └── logger.service.ts    # Winston ロガー
│   │
│   └── types/                   # 型定義
│       ├── electron.d.ts        # Window.electron型
│       └── document.ts          # ドキュメント関連型
│
├── tests/                       # テストコード
│   ├── unit/                    # ユニットテスト
│   └── integration/             # 統合テスト
│
└── docs/                        # ドキュメント
    ├── SETUP.md                 # セットアップ手順
    ├── REFERENCES.md            # 参考資料
    └── FUTURE_FEATURES.md       # 将来実装予定機能
```

---

## 💰 コスト見積もり

### API利用料金

**Deepgram**:
- 無料クレジット: $200
- 利用可能時間: 約46,000分（約767時間）
- 日常開発では無料枠内で完結

**OpenAI**:
| API | 料金 | 用途 |
|-----|------|------|
| GPT-4o（入力） | $0.005/1k tokens | AI回答生成 |
| GPT-4o（出力） | $0.015/1k tokens | AI回答生成 |
| text-embedding-3-small | $0.00002/1k tokens | ドキュメント埋め込み |

**月額コスト目安**:
- 開発・個人利用: 約$10以下
- 月100回答: 約$1
- 月1000回答: 約$10

---

## 📅 開発フェーズ

### 完了済み（Phase 1-3）

| Phase | 主要タスク | 成果物 |
|-------|-----------|--------|
| Phase 1 | 音声認識実装（Deepgram） | リアルタイム文字起こし |
| Phase 2 | LLM統合（OpenAI） | AI回答生成 |
| Phase 3 | コンテキスト管理（RAG） | 履歴書ベース回答 |

### 次フェーズ（Phase 4）

UI/UX改善の検討項目:
1. 設定画面UI（APIキー設定）
2. テーマ切り替え（ダーク/ライト）
3. トースト通知システム
4. セッション履歴保存
5. キーボードショートカット

詳細は [docs/FUTURE_FEATURES.md](./docs/FUTURE_FEATURES.md) を参照。

---

## 📚 参考プロジェクト・サービス

### オープンソースプロジェクト

| プロジェクト | 技術 | 参考部分 |
|------------|------|---------|
| [Interview-Assistant](https://github.com/nohairblingbling/Interview-Assistant) | Electron + TypeScript | 透明オーバーレイ実装 |
| [AI-powererd-interview-Assistant](https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant) | Next.js + Deepgram | RAG実装（Pinecone） |

### 商用サービス（参考資料）

| サービス | 特徴 | 参考にした点 |
|---------|------|------------|
| [Cluely](https://cluely.ai/) | 米国、透明オーバーレイ | セキュリティ設計 |
| [CueMe](https://cueme.app/) | 日本発、Mac専用 | 日本語UI/UX |

詳細は [docs/REFERENCES.md](./docs/REFERENCES.md) を参照。

---

## 🚀 クイックスタート

### 1. 依存関係インストール

```bash
pnpm install
```

### 2. 環境変数設定

```bash
cp .env.example .env
# .envにAPIキーを記入
```

### 3. 開発サーバー起動

```bash
pnpm dev
```

### 4. 使用方法

1. 「録音開始」ボタンをクリック
2. 面接官の質問を自動認識
3. 履歴書/求人票をアップロード（オプション）
4. AI回答が自動生成

詳細は [docs/SETUP.md](./docs/SETUP.md) を参照。

---

## 📝 重要な注意事項

### セキュリティ

- APIキー（`.env`）は**絶対にGitにコミットしない**
- electron-storeで暗号化保存
- 通信はすべてHTTPS/WSS

### 倫理

このツールは**教育・研究目的**です：
- 実際の面接での使用は企業規約違反の可能性
- 使用は自己責任
- 開発者は責任を負わない

### ライセンス

MIT License（自由に改変・配布可能）

---

## ✅ 開発環境チェックリスト

- [ ] Node.js v18.x以上をインストール済み
- [ ] pnpmをインストール済み（`npm install -g pnpm`）
- [ ] Deepgram APIキーを取得済み
- [ ] OpenAI APIキーを取得済み（支払い方法登録済み）
- [ ] Visual Studio Codeをインストール済み

---

**最終更新**: 2026-02-04
