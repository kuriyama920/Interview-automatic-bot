# SNS Auto Uploader

非公式ライブラリを使った X / Instagram / TikTok 自動投稿ツール。

## 使用ライブラリ

| Platform | Library | Method |
|----------|---------|--------|
| X (Twitter) | [Twikit](https://github.com/d60/twikit) | Internal GraphQL API |
| Instagram | [instagrapi](https://github.com/subzeroid/instagrapi) | Private Mobile API |
| TikTok | [tiktokautouploader](https://github.com/haziq-exe/TikTokAutoUploader) | Playwright browser automation |

## セットアップ

### 1. Python venv 作成

```powershell
cd tools/sns-uploader
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

### 2. 環境変数設定

```powershell
copy .env.example .env
# .env を編集してアカウント情報を入力
```

### 3. 初回セッション取得

```powershell
# 全プラットフォーム
venv\Scripts\python.exe setup_sessions.py all

# 個別
venv\Scripts\python.exe setup_sessions.py x
venv\Scripts\python.exe setup_sessions.py instagram
venv\Scripts\python.exe setup_sessions.py tiktok
```

> IP がブロックされる場合は `.env` に `PROXY_URL` を設定してください。

### 4. 動作確認

```powershell
venv\Scripts\python.exe main.py status
```

## 使い方

### 動画を投稿

```powershell
# 全プラットフォームに投稿
venv\Scripts\python.exe main.py post --video ./path/to/video.mp4 --description "説明文" --hashtags "面接対策,AI,転職"

# 特定プラットフォームのみ
venv\Scripts\python.exe main.py post --video ./path/to/video.mp4 --platforms x,instagram
```

### video-shorts の最新動画を投稿

```powershell
venv\Scripts\python.exe main.py post-latest --platforms x,instagram,tiktok
```

### Node.js ブリッジ経由

```powershell
node bridge.js post-latest --platforms x,instagram,tiktok
node bridge.js post --video ../video-shorts/output/latest.mp4 --platforms x
```

## プロキシ設定

IP ブロック対策として、`.env` にプロキシを設定可能：

```env
# HTTP プロキシ
PROXY_URL=http://user:pass@host:port

# SOCKS5 プロキシ
PROXY_URL=socks5://user:pass@host:port
```

全 uploader (X, Instagram, TikTok) でプロキシが自動適用される。

## GitHub Actions 連携

`.github/workflows/video-shorts.yml` に SNS 投稿ステップが統合済み。

### 必要な GitHub Secrets

| Secret | 用途 |
|--------|------|
| `X_USERNAME` | X ユーザー名 |
| `X_EMAIL` | X メール |
| `X_PASSWORD` | X パスワード |
| `INSTAGRAM_USERNAME` | Instagram ユーザー名 |
| `INSTAGRAM_PASSWORD` | Instagram パスワード |
| `TIKTOK_USERNAME` | TikTok ユーザー名 |
| `X_COOKIES_JSON` | X Cookie JSON (setup_sessions.py で取得) |
| `IG_SESSION_JSON` | Instagram セッション JSON (setup_sessions.py で取得) |
| `SNS_PROXY_URL` | プロキシ URL (任意) |

### ワークフロー実行

GitHub Actions > workflow_dispatch で `sns_platforms` に `x,instagram,tiktok` を入力して実行。

## プロジェクト構造

```
sns-uploader/
├── main.py              # CLI エントリーポイント
├── bridge.js            # Node.js → Python ブリッジ
├── setup_sessions.py    # 初回セッション取得
├── requirements.txt     # Python 依存
├── .env                 # 環境変数（git 管理外）
├── .env.example         # 環境変数テンプレート
├── sessions/            # 認証セッション保存先（git 管理外）
└── src/
    ├── config.py        # 設定管理
    ├── logger.py        # ロギング
    ├── types.py         # 型定義
    ├── orchestrator.py  # 投稿オーケストレーター
    └── uploaders/
        ├── x_uploader.py      # X (Twitter)
        ├── ig_uploader.py     # Instagram
        └── tiktok_uploader.py # TikTok
```

## 注意事項

- 非公式 API のため、アカウント凍結リスクあり
- 投稿間隔（`POST_DELAY_SECONDS`）を30秒以上に設定推奨
- TikTok は初回実行時にブラウザが開き手動ログインが必要
- セッションは `sessions/` に保存、定期的な再認証が必要な場合あり
