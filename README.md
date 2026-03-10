# Interview Automatic Bot

リアルタイムAI面接支援デスクトップアプリケーション（Windows対応）

## 概要

このプロジェクトは、オンライン面接中にリアルタイムで質問を認識し、AI（LLM）による回答例を生成する**Windows向けデスクトップアプリケーション**です。

### 主要機能

- **リアルタイム音声認識**: Deepgram APIによる超低遅延（<300ms）文字起こし
- **AI回答生成**: OpenAI GPT-5 Miniによる質問への回答例生成（ストリーミング対応）
- **コンテキスト管理**: 履歴書・求人票をアップロードしてRAGベースの回答生成
- **自動コンテキスト統合**: アップロードしたドキュメントを自動的に回答に反映

### 実装状況

| Phase | 機能 | ステータス |
|-------|------|-----------|
| Phase 1-4 | 音声認識・AI回答・コンテキスト・UI | ✅ 完了 |
| Phase 5 | SaaS基盤（Google OAuth + Supabase） | ✅ 完了 |
| Phase 6 | クラウドRAG（pgvector） | ✅ 完了 |
| Phase 6.5 | システム音声キャプチャ（Zoom/Teams対応） | ✅ 完了 |
| Phase 7 | Stripe決済 + サブスクリプション管理 | ✅ 完了 |
| Phase 8 | APIプロキシ（ユーザーAPIキー不要化） | ✅ 完了 |
| - | Cloudflare Workers移行（Vercel → Cloudflare） | ✅ 完了 |

### なぜデスクトップアプリが必要か？

Webブラウザでは以下の機能が**技術的に不可能**です：

| 機能 | デスクトップ | Web | 理由 |
|------|------------|-----|------|
| システム音声キャプチャ | ✅ | ❌ | ブラウザはZoom/Teams等の音声を取得不可 |
| 透明オーバーレイ | ✅ | ❌ | OSレベルのウィンドウ操作が必要 |
| 画面共有時に非表示 | ✅ | ❌ | ブラウザタブは必ず映る |
| グローバルホットキー | ✅ | ❌ | タブフォーカス外では動作不可 |

---

## 技術スタック

### コア技術

| カテゴリ | 技術 | バージョン |
|---------|------|-----------|
| フレームワーク | Electron | 28.x |
| UI | React | 18.2 |
| 言語 | TypeScript | 5.3 |
| ビルドツール | electron-vite | 2.0 |
| スタイリング | Tailwind CSS + DaisyUI | 3.4 / 4.6 |

### 主要ライブラリ

| 機能 | ライブラリ | 用途 |
|------|-----------|------|
| 音声認識 | @deepgram/sdk | リアルタイムSTT（WebSocket） |
| AI | openai | GPT-5 Mini回答生成、Embeddings |
| ローカル保存 | electron-store | AES暗号化設定保存 |
| ログ | winston | 構造化ログ出力 |

### 開発ツール

| ツール | 用途 |
|--------|------|
| Vitest | 単体テスト |
| Playwright | E2Eテスト |
| ESLint + Prettier | コード品質 |
| electron-builder | Windows .exe生成 |

---

## プロジェクト構造

```
interview-automatic-bot/
├── README.md                    # このファイル
├── CLAUDE.md                    # Claude Code用ガイダンス
├── ARCHITECTURE.md              # アーキテクチャ設計書
├── package.json                 # 依存関係・スクリプト
├── .env.example                 # 環境変数テンプレート
│
├── src/
│   ├── main/                    # Electronメインプロセス
│   ├── preload/                 # プリロードスクリプト
│   ├── renderer/src/            # React UI
│   │   ├── components/          # UIコンポーネント（5サブディレクトリ）
│   │   ├── contexts/            # React Context（Interview, Navigation）
│   │   └── hooks/               # カスタムフック（13個）
│   ├── services/                # ビジネスロジック（6サービス）
│   └── types/                   # 型定義
│
├── apps/
│   ├── worker/                  # Cloudflare Workers API（Hono）
│   │   ├── src/routes/          # APIルート（7ファイル）
│   │   ├── src/lib/             # 共有ユーティリティ（15ファイル）
│   │   └── tests/               # Workerユニットテスト
│   └── web/                     # ランディングページ（Next.js）
│
├── tests/                       # E2Eテスト
├── scripts/                     # ユーティリティスクリプト
│
└── docs/
    ├── SETUP.md                 # セットアップ手順
    ├── PHASE_ROADMAP.md         # Phase 6.5-9 詳細計画
    └── UI_DESIGN_GUIDELINES.md  # UIデザインガイドライン
```

---

## セットアップ手順

### 前提条件

- **Node.js**: v22.x LTS以上
- **pnpm**: 最新版（推奨）
- **Git**: 最新版
- **Windows 10/11**: 64bit（本番利用時）

### 1. リポジトリクローン

```bash
git clone https://github.com/yourusername/Interview-automatic-bot.git
cd Interview-automatic-bot
```

### 2. 依存関係インストール

```bash
pnpm install
```

### 3. 環境変数設定

`.env.example`をコピーして`.env`を作成：

```bash
cp .env.example .env
```

`.env`に以下を記載：

```env
# SaaS接続（プロキシモード: APIキー不要）
API_BASE_URL=https://api.interviewbot.app

# カスタムキー使用時のみ（オプション）
# DEEPGRAM_API_KEY=your_deepgram_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here
```

### 4. 開発サーバー起動

```bash
pnpm dev
```

Electronアプリが起動します。

### 5. ビルド（Windows .exe作成）

```bash
pnpm build:win
```

`dist/`フォルダに実行ファイルが生成されます。

---

## 使用方法

### 1. 初期設定

1. `.env`ファイルにAPI_BASE_URLを設定（プロキシモード）
2. `pnpm dev`でアプリを起動
3. Google OAuthでログイン

### 2. ドキュメントアップロード（オプション）

1. 左カラムの「履歴書をアップロード」または「求人票をアップロード」をクリック
2. PDF/DOCXファイルを選択
3. 自動的に解析・インデックス化

### 3. 面接中の使用

1. 「録音開始」ボタンをクリック
2. 面接官の質問を自動認識
3. AI回答が自動生成（コンテキストを自動反映）
4. 「AI回答生成」ボタンで手動生成も可能

### WSL2環境での動作確認

WSL2環境ではマイクが使用できないため、「音声ファイルでテスト」ボタンで動作確認できます。

1. X11サーバー（VcXsrv等）を起動
2. `export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0`
3. `pnpm dev`
4. 「音声ファイルでテスト」ボタンで.wav/.mp3ファイルを選択

---

## 開発コマンド

```bash
# 開発
pnpm dev              # 開発サーバー起動

# ビルド
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー作成
pnpm build:portable   # ポータブル版作成

# テスト（Electronアプリ）
pnpm test             # テスト実行（watchモード）
pnpm test --run       # テスト実行（1回）
pnpm test:ui          # テストUI表示
pnpm test:coverage    # カバレッジレポート

# テスト（Cloudflare Workers）
cd apps/worker && npx vitest run              # ユニットテスト
cd apps/worker && npx vitest run --coverage   # カバレッジ付き

# Stripe E2Eテスト
.\scripts\e2e-stripe-test.ps1                        # 非認証テスト
.\scripts\e2e-stripe-test.ps1 -JwtToken "eyJhbG..."  # 認証テスト含む

# コード品質
pnpm lint             # ESLint実行
pnpm lint:fix         # ESLint自動修正
pnpm format           # Prettier実行
```

---

## 参考プロジェクト・サービス

### オープンソースプロジェクト

| プロジェクト | 技術 | 参考にした部分 |
|------------|------|--------------|
| [Interview-Assistant](https://github.com/nohairblingbling/Interview-Assistant) | Electron + TypeScript | 透明オーバーレイ実装、Deepgram統合 |
| [AI-powererd-interview-Assistant](https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant) | Next.js + Deepgram | RAG実装（Pinecone + LangChain） |

### 商用サービス（参考資料）

| サービス | 参考ポイント |
|---------|------------|
| [Cluely](https://cluely.ai/) | セキュリティ・コンプライアンス設計 |
| [CueMe](https://cueme.app/) | 日本語UI/UX、ホットキー実装 |


---

## ライセンス

MIT License

---

## 免責事項

**重要**: このツールは教育・研究目的で開発されています。

- 面接での使用は多くの企業の規約に違反する可能性があります
- 実際の面接での使用は推奨されません
- 開発者は本ツールの使用による結果について一切の責任を負いません
- 使用は自己責任でお願いします

**倫理的な使用を推奨**:
- 面接練習ツールとして使用
- 自己学習・スキル向上のため
- 企業の許可を得た上での使用

---

## コントリビューション

プルリクエスト・Issue歓迎です！

1. このリポジトリをフォーク
2. フィーチャーブランチ作成（`git checkout -b feature/amazing-feature`）
3. コミット（`git commit -m 'Add amazing feature'`）
4. プッシュ（`git push origin feature/amazing-feature`）
5. プルリクエスト作成

---

## 参考資料

- [Electron公式ドキュメント](https://www.electronjs.org/docs)
- [Deepgram API Docs](https://developers.deepgram.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Documentation](https://hono.dev/)

---

**最終更新**: 2026-03-09
