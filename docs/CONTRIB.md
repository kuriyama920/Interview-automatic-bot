# 開発者向けガイド (CONTRIB.md)

> 自動生成: package.json と .env.example から生成

## 開発環境セットアップ

### 必要条件

- Node.js 20.x 以上
- pnpm（推奨）または npm
- Windows 10/11（ビルド対象）

### 初期セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/interview-automatic-bot.git
cd interview-automatic-bot

# 依存関係をインストール
pnpm install

# 環境変数を設定
cp .env.example .env
# .env ファイルを編集してAPIキーを設定
```

## 環境変数

| 変数名 | 必須 | 説明 | 取得先 |
|--------|------|------|--------|
| `DEEPGRAM_API_KEY` | Yes | 音声認識APIキー | https://console.deepgram.com/ |
| `OPENAI_API_KEY` | Yes | AI回答生成用APIキー | https://platform.openai.com/api-keys |
| `ANTHROPIC_API_KEY` | No | Claude API（オプション） | https://console.anthropic.com/ |
| `LOG_LEVEL` | No | ログレベル（debug/info/warn/error） | デフォルト: info |
| `NODE_ENV` | No | 環境（development/production） | デフォルト: development |

## 利用可能なスクリプト

| コマンド | 説明 |
|----------|------|
| `pnpm dev` | 開発サーバーを起動（ホットリロード有効） |
| `pnpm build` | プロダクションビルド |
| `pnpm preview` | ビルド結果をプレビュー |
| `pnpm build:win` | Windows用インストーラー（.exe）を作成 |
| `pnpm build:portable` | Windows用ポータブル版を作成 |
| `pnpm lint` | ESLintでコードチェック |
| `pnpm lint:fix` | ESLintで自動修正 |
| `pnpm format` | Prettierでコードフォーマット |
| `pnpm test` | テスト実行 |
| `pnpm test:ui` | テストUIを起動 |
| `pnpm test:coverage` | カバレッジレポート付きテスト |

## 開発ワークフロー

### 1. 機能開発

```bash
# 1. 開発サーバー起動
pnpm dev

# 2. コード変更後、リントとフォーマット
pnpm lint:fix
pnpm format

# 3. テスト実行
pnpm test
```

### 2. ビルド・リリース

```bash
# 1. テストとリント確認
pnpm test
pnpm lint

# 2. ビルド
pnpm build

# 3. Windows向けパッケージ作成
pnpm build:win      # インストーラー版
pnpm build:portable # ポータブル版
```

## テスト

### テスト構成

- **フレームワーク**: Vitest
- **UIテスト**: Testing Library
- **E2Eテスト**: Playwright

### テスト実行

```bash
# 通常実行
pnpm test

# ウォッチモード
pnpm test --watch

# カバレッジ
pnpm test:coverage

# 特定ファイル
pnpm test src/services/stt.service.test.ts
```

## ディレクトリ構造

```
src/
├── main/              # Electronメインプロセス
├── preload/           # プリロードスクリプト
├── renderer/          # Reactアプリ
├── services/          # 共有サービス
└── types/             # 型定義

tests/
├── unit/              # ユニットテスト
├── integration/       # 統合テスト
└── e2e/               # E2Eテスト
```

## コーディング規約

- ESLint + Prettierの設定に従う
- TypeScript strictモード
- コミットメッセージは Conventional Commits 形式

## トラブルシューティング

### よくある問題

**Q: `pnpm dev` でElectronが起動しない**
```bash
# ELECTRON_RUN_AS_NODEをクリア
unset ELECTRON_RUN_AS_NODE
pnpm dev
```

**Q: ビルドエラーが発生する**
```bash
# node_modulesを削除して再インストール
rm -rf node_modules
pnpm install
```
