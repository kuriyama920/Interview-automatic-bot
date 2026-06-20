# Windows での実行方法

## 前提条件

- Windows 10/11 (64bit)
- Node.js 22.x LTS以上 ([ダウンロード](https://nodejs.org/))
- pnpm ([インストール](https://pnpm.io/installation))
- マイク（内蔵または外付け）

## セットアップ手順

### 1. リポジトリクローン

PowerShellを開いて以下を実行:

```powershell
git clone https://github.com/kuriyama920/Interview-automatic-bot.git
cd Interview-automatic-bot
```

### 2. 環境変数を設定

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` ファイルを編集:

```env
# SaaS接続（プロキシモード: APIキー不要）
API_BASE_URL=https://interview-bot-api.interviewautomaticbot92.workers.dev

# カスタムキー使用時のみ（オプション）
# SONIOX_API_KEY=your_soniox_api_key_here
# OPENAI_API_KEY=your_openai_api_key_here
```

### 3. 依存関係をインストール

```powershell
pnpm install
```

### 4. 開発モードで実行

```powershell
pnpm dev
```

アプリ起動後、Google OAuthでログインしてください。

## ポータブル版のビルド

```powershell
pnpm build:portable
```

ビルド完了後、`dist/` フォルダに実行ファイルが生成されます。

## トラブルシューティング

### マイクが認識されない

1. Windowsの設定 → プライバシー → マイク でアプリのアクセスを許可
2. デバイスマネージャーでマイクが正常に動作しているか確認

### ログインできない

- インターネット接続を確認
- `API_BASE_URL` が正しく設定されているか確認
- ファイアウォールがElectronの通信をブロックしていないか確認

### ビルドエラー

```powershell
# node_modulesを削除して再インストール
Remove-Item -Recurse -Force node_modules
pnpm install
```
