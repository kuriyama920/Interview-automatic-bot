# Windows での実行方法

## 前提条件

- Windows 10/11
- Node.js 18以上 ([ダウンロード](https://nodejs.org/))
- マイク（内蔵または外付け）

## セットアップ手順

### 1. プロジェクトをWindows側にコピー

PowerShellを開いて以下を実行:

```powershell
# WSL2からコピー（パスは適宜変更）
Copy-Item -Recurse \\wsl$\Ubuntu\home\kuriyamanaoto\personal\Interview-automatic-bot C:\Interview-automatic-bot
cd C:\Interview-automatic-bot
```

または、エクスプローラーで `\\wsl$\Ubuntu\home\kuriyamanaoto\personal\Interview-automatic-bot` にアクセスして手動でコピー。

### 2. 環境変数を設定

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env` ファイルを編集して `DEEPGRAM_API_KEY` を設定:

```
DEEPGRAM_API_KEY=your_actual_api_key_here
```

### 3. 依存関係をインストール

```powershell
npm install
```

### 4. 開発モードで実行

```powershell
npm run dev
```

## ポータブル版のビルド

```powershell
npm run build:portable
```

ビルド完了後、`dist-electron` フォルダに実行ファイルが生成されます。

## トラブルシューティング

### マイクが認識されない

1. Windowsの設定 → プライバシー → マイク でアプリのアクセスを許可
2. デバイスマネージャーでマイクが正常に動作しているか確認

### APIキーエラー

- `.env` ファイルがプロジェクトルートに存在するか確認
- `DEEPGRAM_API_KEY` が正しく設定されているか確認

### ビルドエラー

```powershell
# node_modulesを削除して再インストール
Remove-Item -Recurse -Force node_modules
npm install
```
