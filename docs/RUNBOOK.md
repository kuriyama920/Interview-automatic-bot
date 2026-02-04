# 運用マニュアル (RUNBOOK.md)

> 自動生成: package.json と .env.example から生成

## デプロイ手順

### Windows インストーラー版

```bash
# 1. テスト確認
pnpm test
pnpm lint

# 2. プロダクションビルド
pnpm build

# 3. Windowsインストーラー作成
pnpm build:win

# 4. 出力確認
ls dist-electron/
# InterviewBot-Setup-1.0.0.exe
```

### Windows ポータブル版

```bash
# 1. ビルド
pnpm build

# 2. ポータブル版作成
pnpm build:portable

# 3. 出力確認
ls dist-electron/
# InterviewBot-1.0.0-Portable.exe
```

## 配布

### 配布物

| ファイル | 説明 | 対象ユーザー |
|----------|------|-------------|
| `InterviewBot-Setup-x.x.x.exe` | インストーラー版 | 一般ユーザー |
| `InterviewBot-x.x.x-Portable.exe` | ポータブル版 | USBから実行したいユーザー |

### リリースチェックリスト

- [ ] バージョン番号を package.json で更新
- [ ] CHANGELOG.md を更新
- [ ] `pnpm test` が成功
- [ ] `pnpm lint` がエラーなし
- [ ] `pnpm build:win` が成功
- [ ] 生成された .exe をテスト実行

## モニタリング・ログ

### ログの場所

```
# Windows
%APPDATA%/interview-automatic-bot/logs/

# 開発時
./logs/
```

### ログレベル

| レベル | 説明 | 用途 |
|--------|------|------|
| `debug` | 詳細なデバッグ情報 | 開発・トラブルシューティング |
| `info` | 一般的な情報 | 通常運用 |
| `warn` | 警告 | 注意が必要な状況 |
| `error` | エラー | 問題発生時 |

### ログレベル変更

```bash
# .env ファイルで設定
LOG_LEVEL=debug
```

## よくある問題と対処法

### 1. 音声認識が動作しない

**症状**: 音声入力しても文字起こしされない

**確認事項**:
```
1. マイクの権限が許可されているか
2. DEEPGRAM_API_KEY が正しく設定されているか
3. インターネット接続があるか
```

**対処**:
```bash
# APIキーの確認
echo $DEEPGRAM_API_KEY

# ログで詳細確認
LOG_LEVEL=debug pnpm dev
```

### 2. APIキーエラー

**症状**: "Invalid API Key" エラー

**対処**:
```
1. .env ファイルのAPIキーを確認
2. APIキーに余分な空白がないか確認
3. APIキーの有効期限を確認
```

### 3. アプリが起動しない

**症状**: ダブルクリックしても起動しない

**対処**:
```bash
# コマンドラインから起動してエラー確認
./InterviewBot-x.x.x-Portable.exe

# 依存関係の問題の場合
# Visual C++ 再頒布可能パッケージをインストール
```

### 4. ビルドエラー

**症状**: `pnpm build:win` が失敗

**対処**:
```bash
# キャッシュクリア
rm -rf node_modules/.cache
rm -rf out/
rm -rf dist-electron/

# 再ビルド
pnpm install
pnpm build:win
```

## ロールバック手順

### アプリケーションのロールバック

```bash
# 1. 以前のバージョンのタグをチェックアウト
git checkout v0.9.0

# 2. 依存関係を再インストール
pnpm install

# 3. 再ビルド
pnpm build:win
```

### 設定のリセット

```bash
# ユーザー設定をリセット（Windows）
rm -rf %APPDATA%/interview-automatic-bot/
```

## セキュリティ注意事項

### APIキーの取り扱い

- APIキーは絶対にコミットしない
- `.env` ファイルは `.gitignore` に含める
- 本番用と開発用でAPIキーを分ける

### 配布時の注意

- 配布する .exe にAPIキーが含まれていないか確認
- ユーザーには自身のAPIキーを使用させる

## 連絡先

- **バグ報告**: GitHub Issues
- **機能要望**: GitHub Discussions
