# セットアップガイド

このガイドでは、開発環境のセットアップから初回起動までの手順を説明します。

---

## 前提条件

### 必須ソフトウェア

以下をインストールしてください：

1. **Node.js v18.x LTS**（厳密なバージョン管理推奨）
   - 推奨: v18.19.0以上
   - インストール確認: `node --version`

2. **Git**
   - ダウンロード: https://git-scm.com/
   - インストール確認: `git --version`

3. **Visual Studio Code（推奨）**
   - ダウンロード: https://code.visualstudio.com/

### Node.js バージョン管理（チーム共有推奨）

チームで同じNode.jsバージョンを使用するため、以下のいずれかを設定します：

#### 方法A: nvm + .nvmrc（推奨）

```bash
# nvmインストール（Windowsの場合: nvm-windows）
# https://github.com/nvm-sh/nvm (Mac/Linux)
# https://github.com/coreybutler/nvm-windows (Windows)

# プロジェクトで使用するバージョンをインストール
nvm install 18.19.0
nvm use 18.19.0

# .nvmrcファイルで固定（既にリポジトリに含まれています）
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

# Voltaユーザーは自動的に正しいバージョンが使われる
```

#### 方法C: 直接インストール

Node.js公式サイトからLTS版をダウンロード:
- ダウンロード: https://nodejs.org/

### 推奨VSCode拡張機能

プロジェクトをVSCodeで開くと、推奨拡張機能のインストールが促されます。
手動でインストールする場合は以下:

- ESLint
- Prettier - Code formatter
- Tailwind CSS IntelliSense
- Error Lens
- GitLens

---

## ステップ1: プロジェクト初期化

### 1.1 リポジトリクローン（既存の場合）

```bash
git clone https://github.com/yourusername/interview-automatic-bot.git
cd interview-automatic-bot
```

### 1.2 新規プロジェクト作成（まだ作成していない場合）

```bash
# Electron Vite公式テンプレート使用
npm create @quick-start/electron@latest interview-automatic-bot

# 以下を選択:
# ✔ Project name: interview-automatic-bot
# ✔ Select a framework: react
# ✔ Add TypeScript? Yes
# ✔ Add Electron updater plugin? No
# ✔ Enable Electron download mirror proxy? No

cd interview-automatic-bot
```

---

## ステップ2: 依存関係インストール

### 2.1 パッケージマネージャー選択

**npm使用の場合:**
```bash
npm install
```

**pnpm使用の場合（推奨・高速）:**
```bash
# pnpmインストール（まだの場合）
npm install -g pnpm

# 依存関係インストール
pnpm install
```

### 2.2 主要ライブラリ追加

```bash
# 音声認識・AI関連
pnpm add @deepgram/sdk openai

# ストレージ・ユーティリティ
pnpm add electron-store winston ws

# UI関連
pnpm add @reduxjs/toolkit react-redux
pnpm add tailwindcss daisyui postcss autoprefixer
pnpm add react-markdown

# RAG関連
pnpm add langchain pdf-parse mammoth

# 開発依存
pnpm add -D @types/ws @types/pdf-parse
pnpm add -D eslint prettier eslint-config-prettier
pnpm add -D electron-builder
pnpm add -D vitest @vitest/ui @testing-library/react
```

---

## ステップ3: 環境変数設定

### 3.1 .envファイル作成

```bash
# .env.exampleをコピー
cp .env.example .env
```

### 3.2 APIキー取得

#### Deepgram API

1. https://console.deepgram.com/ にアクセス
2. アカウント作成（GitHubアカウントで連携可能）
3. 無料クレジット$200を自動取得
4. 左メニュー「API Keys」→「Create a New API Key」
5. キーをコピー

#### OpenAI API

1. https://platform.openai.com/ にアクセス
2. アカウント作成
3. 「Billing」→支払い方法登録（最低$5チャージ）
4. 「API Keys」→「Create new secret key」
5. キーをコピー（一度しか表示されないので注意！）

### 3.3 .envファイル編集

`.env`ファイルを開いて以下のように編集:

```env
# Deepgram API
DEEPGRAM_API_KEY=abcdef1234567890abcdef1234567890

# OpenAI API
OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz1234567890

# ログレベル
LOG_LEVEL=info
```

⚠️ **重要**: `.env`ファイルは絶対にGitにコミットしないでください！

---

## ステップ4: Tailwind CSS設定

### 4.1 設定ファイル作成

```bash
npx tailwindcss init -p
```

### 4.2 tailwind.config.js編集

`tailwind.config.js`を以下の内容に置き換え:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["dark", "light"],
  },
}
```

### 4.3 CSSインポート

`src/renderer/src/index.css`を作成（または編集）:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## ステップ5: TypeScript設定

### 5.1 tsconfig.json確認

プロジェクトルートの`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## ステップ6: 開発サーバー起動

### 6.1 初回起動

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

### 6.2 Hot Reload確認

`src/renderer/src/App.tsx`を編集してみてください:

```tsx
export default function App() {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold">Interview Bot - Test</h1>
      <p>Hot Reload is working! 🚀</p>
    </div>
  );
}
```

保存すると、自動的にアプリがリロードされます。

---

## ステップ7: ビルド確認（オプション）

開発が進んだら、Windows .exeをビルドできます:

```bash
# ビルド（.exe生成）
pnpm run build:win

# ポータブル版生成
pnpm run build:portable
```

生成物は`dist-electron/`フォルダに保存されます。

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
# または
npm install
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

---

## 次のステップ

✅ セットアップ完了後、以下のドキュメントを参照してください:

1. **[DEVELOPMENT.md](../DEVELOPMENT.md)**: 開発ワークフロー
2. **[ARCHITECTURE.md](../ARCHITECTURE.md)**: システム設計
3. **[README.md](../README.md)**: プロジェクト概要

---

## サポート

問題が解決しない場合:

- GitHub Issues: https://github.com/yourusername/interview-automatic-bot/issues
- ドキュメント: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

Happy Coding! 🚀
