# セットアップガイド

このガイドでは、開発環境のセットアップから初回起動までの手順を説明します。

---

## 前提条件

### 必須ソフトウェア

以下をインストールしてください：

1. **Node.js v20.x LTS**
   - 推奨: v20.x以上
   - インストール確認: `node --version`

2. **pnpm**（推奨パッケージマネージャー）
   - インストール: `npm install -g pnpm`
   - インストール確認: `pnpm --version`

3. **Git**
   - ダウンロード: https://git-scm.com/
   - インストール確認: `git --version`

4. **Visual Studio Code**（推奨）
   - ダウンロード: https://code.visualstudio.com/

### Node.js バージョン管理

#### 方法A: nvm + .nvmrc（推奨）

```bash
# nvmインストール（Windowsの場合: nvm-windows）
# https://github.com/nvm-sh/nvm (Mac/Linux)
# https://github.com/coreybutler/nvm-windows (Windows)

# プロジェクトで使用するバージョンをインストール
nvm install 18.19.0
nvm use 18.19.0

# チームメンバーは以下を実行するだけでOK
nvm use
```

#### 方法B: Volta（自動バージョン切替）

```bash
# Voltaインストール
# https://volta.sh/

# プロジェクトでバージョン固定
volta pin node@18.19.0
volta pin pnpm@8.15.0
```

### 推奨VSCode拡張機能

- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- Error Lens
- GitLens

---

## ステップ1: リポジトリクローン

```bash
git clone https://github.com/yourusername/Interview-automatic-bot.git
cd Interview-automatic-bot
```

---

## ステップ2: 依存関係インストール

```bash
pnpm install
```

### インストールされる主要ライブラリ

| カテゴリ | ライブラリ | 用途 |
|---------|-----------|------|
| 音声認識 | @deepgram/sdk | リアルタイムSTT（WebSocket） |
| AI | openai | GPT-5回答生成、Embeddings |
| PDF解析 | pdf-parse | 履歴書PDFテキスト抽出 |
| DOCX解析 | mammoth | Word文書テキスト抽出 |
| テキスト分割 | langchain | RecursiveCharacterTextSplitter |
| ログ | winston | 構造化ログ出力 |
| UI | tailwindcss, daisyui | スタイリング |

---

## ステップ3: 環境変数設定

### 3.1 .envファイル作成

```bash
cp .env.example .env
```

### 3.2 APIキー取得

#### Deepgram API

1. https://console.deepgram.com/ にアクセス
2. アカウント作成（GitHubアカウントで連携可能）
3. 無料クレジット$200を自動取得
4. 左メニュー「API Keys」→「Create a New API Key」
5. キーをコピー

**料金**: $0.0043/分（無料枠で約46,000分）

#### OpenAI API

1. https://platform.openai.com/ にアクセス
2. アカウント作成
3. 「Billing」→支払い方法登録（最低$5チャージ）
4. 「API Keys」→「Create new secret key」
5. キーをコピー（一度しか表示されないので注意！）

**料金（GPT-5）**:
- 入力: $1.25/1M tokens
- 出力: $10.00/1M tokens

### 3.3 .envファイル編集

`.env`ファイルを開いて以下のように編集:

```env
# Deepgram API
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OpenAI API
OPENAI_API_KEY=your_openai_api_key_here

# ログレベル（オプション）
LOG_LEVEL=info
```

⚠️ **重要**: `.env`ファイルは絶対にGitにコミットしないでください！

---

## ステップ4: 開発サーバー起動

```bash
pnpm dev
```

以下のような出力が表示されればOK:

```
  VITE v5.0.0  ready in 234 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose

  Electron app is ready!
```

Electronウィンドウが自動的に開きます。

### Hot Reload確認

`src/renderer/src/App.tsx`を編集すると、自動的にアプリがリロードされます。

---

## ステップ5: 動作確認

### 基本機能の確認

1. **音声認識**: 「録音開始」ボタンをクリック
2. **AI回答生成**: 質問を入力して「AI回答生成」ボタンをクリック
3. **ドキュメントアップロード**: PDFまたはDOCXファイルをアップロード

### WSL2環境での動作確認

WSL2環境ではマイクが使用できないため、「音声ファイルでテスト」ボタンで動作確認できます。

1. X11サーバー（VcXsrv等）を起動
2. `export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0`
3. `pnpm dev`
4. 「音声ファイルでテスト」ボタンで.wav/.mp3ファイルを選択

---

## ステップ6: ビルド（オプション）

開発が進んだら、Windows .exeをビルドできます:

```bash
# ビルド（.exe生成）
pnpm build:win

# ポータブル版生成
pnpm build:portable
```

生成物は`dist-electron/`フォルダに保存されます。

---

## 開発コマンド一覧

```bash
# 開発
pnpm dev              # 開発サーバー起動

# ビルド
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー作成
pnpm build:portable   # ポータブル版作成

# テスト
pnpm test             # テスト実行（watchモード）
pnpm test --run       # テスト実行（1回）
pnpm test:ui          # テストUI表示
pnpm test:coverage    # カバレッジレポート

# コード品質
pnpm lint             # ESLint実行
pnpm lint:fix         # ESLint自動修正
pnpm format           # Prettier実行
```

---

## トラブルシューティング

### 問題1: `pnpm: command not found`

**解決策**:
```bash
npm install -g pnpm
```

### 問題2: Electronが起動しない

**原因**: Node.jsバージョンが古い

**解決策**:
```bash
node --version  # v18.x以上であることを確認
# 古い場合はNode.jsを再インストール
```

### 問題3: `Cannot find module '@deepgram/sdk'`

**原因**: 依存関係がインストールされていない

**解決策**:
```bash
pnpm install
```

### 問題4: Windows Defenderがブロックする

**原因**: electron-builderで生成した.exeが署名されていない

**解決策**:
- 「詳細情報」をクリック
- 「実行」を選択
- または、コード署名証明書を取得（有料）

### 問題5: APIキーエラー

**症状**:
```
Error: Unauthorized (401)
```

**解決策**:
1. `.env`ファイルが正しい場所にあるか確認
2. APIキーが正しくコピーされているか確認
3. 余分なスペースや改行がないか確認

### 問題6: WSL2で画面が表示されない

**解決策**:
1. VcXsrvをインストール・起動
2. DISPLAY環境変数を設定:
   ```bash
   export DISPLAY=$(cat /etc/resolv.conf | grep nameserver | awk '{print $2}'):0
   ```
3. VcXsrvの設定で「Disable access control」にチェック

---

## 次のステップ

✅ セットアップ完了後、以下のドキュメントを参照してください:

1. **[README.md](../README.md)**: プロジェクト概要
2. **[CLAUDE.md](../CLAUDE.md)**: 開発ガイダンス
3. **[ARCHITECTURE.md](../ARCHITECTURE.md)**: システム設計

---

## サポート

問題が解決しない場合:

- GitHub Issues: https://github.com/yourusername/interview-automatic-bot/issues
- ドキュメント: このリポジトリの各種.mdファイル

---

**最終更新**: 2026-02-06
