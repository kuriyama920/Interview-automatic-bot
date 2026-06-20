# Interview Automatic Bot

リアルタイムAI面接支援デスクトップアプリケーション（Windows対応）

## 概要

オンライン面接中の音声をリアルタイムに文字起こしし、AIが最適な回答例を即座に提案する**Windows向けデスクトップアプリ**です。Zoom / Google Meet / Teams などの**システム音声**を直接キャプチャできるのが特徴で、ブラウザでは実現できない体験を提供します。

### 主要機能

- **超低遅延の音声認識** : Soniox v4 リアルタイムSTT（WebSocket、16kHz PCM）
- **二段生成AI回答** : `gpt-5-nano`（発言途中の即時応答） + `gpt-5.4-nano`（確定後の高品質応答）
- **クラウドRAG** : 履歴書・求人票・想定質問を pgvector でベクトル検索し、文脈に沿った回答を生成
- **システム音声キャプチャ** : Electron `desktopCapturer` + `setDisplayMediaRequestHandler` で OS 全体の音声を取得
- **SaaSバックエンド** : Cloudflare Workers + Supabase + Google OAuth + Stripe
- **APIキー不要** : プロキシモードでサーバー経由のため、ユーザー側で API キーを準備する必要なし

### なぜデスクトップアプリか？

ブラウザでは下記が**技術的に不可能**なため、Electron を採用しています。

| 機能 | デスクトップ | Web |
|------|------------|-----|
| システム音声キャプチャ（Zoom/Teams等） | ✅ | ❌ |
| 透明オーバーレイ表示 | ✅ | ❌ |
| 画面共有時に自身を非表示 | ✅ | ❌ |
| グローバルホットキー | ✅ | ❌ |

---

## 技術スタック

### Electron クライアント

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Electron 28.x + React 18 |
| ビルド | electron-vite 2.0 / Vite 5 |
| 言語 | TypeScript 5.3 |
| スタイル | Tailwind CSS 3.4 + DaisyUI 4.6 |
| 音声認識 | Soniox v4 RT (WebSocket) |
| 音声キャプチャ | Electron desktopCapturer + setDisplayMediaRequestHandler |
| AI | OpenAI API（gpt-5-nano / gpt-5.4-nano 二段生成） |
| ローカル保存 | electron-store 8.1（AES暗号化） |
| ログ | winston 3 |

### SaaS バックエンド（`apps/worker`）

| カテゴリ | 技術 |
|---------|------|
| API | Cloudflare Workers + Hono 4.12 |
| ランタイム | Workers Runtime（V8 isolates、`nodejs_compat` flag） |
| 配置 | Smart Placement（`mode = "smart"`） |
| AI ゲートウェイ | Cloudflare AI Gateway（`interview-bot-gw`） |
| 認証 | Google OAuth 2.0 + JWT |
| DB | Supabase PostgreSQL + pgvector |
| Supabase SDK | @supabase/supabase-js 2 |
| OpenAI SDK | openai 6 |
| 決済 | Stripe 14（Checkout / Customer Portal / Webhook） |
| ドキュメント解析 | pdf-parse（PDF）/ jszip（DOCX 展開） |
| Cron | 月次使用量リセット（`0 0 1 * *`） |

### ランディングページ（`apps/web`）

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 14（App Router） |
| 言語 | TypeScript 5.3 |
| スタイル | Tailwind CSS 3.4 |
| ビルド | 静的エクスポート（`out/`） |
| ホスティング | Cloudflare Pages（`name = "interview-bot-web"`） |
| 連携 | Stripe Checkout（`/checkout/success` / `/checkout/cancel`）、GitHub Releases API（最新版 `.exe` 取得） |

### 開発ツール

| ツール | 用途 |
|--------|------|
| Vitest（Electron） | レンダラー/メインのユニットテスト |
| Vitest（Worker） | Worker ユニットテスト |
| Playwright | E2E テスト（marketing-site / api-integration プロジェクト分割） |
| Prettier | コードフォーマット |
| electron-builder | NSIS インストーラー + ポータブル `.exe` 生成 |
| wrangler 4 | Cloudflare Workers デプロイ |

---

## プロジェクト構造

```
interview-automatic-bot/
├── README.md                 # このファイル
├── CLAUDE.md                 # Claude Code 用ガイダンス
├── package.json
│
├── src/                      # Electron 本体
│   ├── main/                 # メインプロセス（IPC + Deep Link）
│   ├── preload/              # プリロードスクリプト
│   ├── renderer/src/         # React UI
│   │   ├── App.tsx
│   │   ├── contexts/         # InterviewContext / NavigationContext
│   │   ├── hooks/            # カスタムフック × 14
│   │   └── components/
│   │       ├── dashboard/    # PreparationStatus / QuickStartCard / UsageCard
│   │       ├── interview/    # AIResponsePanel / RecordingControls / TranscriptPanel / AudioSourceToggle
│   │       ├── layout/       # AppShell / Sidebar / SidebarItem / TitleBar
│   │       ├── pages/        # Dashboard / Documents / Interview / Profile / Questions / Subscription
│   │       └── ui/           # PageHeader / icons など共通 UI
│   ├── services/             # auth / stt / ai / context / questions / session / logger / token-storage（× 8）
│   └── types/
│
├── apps/
│   ├── worker/               # Cloudflare Workers API（Hono）
│   │   ├── wrangler.toml     # Smart Placement + Cron + AI Gateway 設定
│   │   ├── src/
│   │   │   ├── index.ts      # エントリ + Cron トリガー（月次使用量リセット）
│   │   │   ├── routes/       # auth / ai / stt / stripe / documents / questions / subscription（× 7）
│   │   │   ├── lib/          # 認証 / 使用量 / Stripe / OpenAI / Supabase / RAG / キャッシュ など（× 21）
│   │   │   └── middleware/   # auth / cors / rate-limit
│   │   └── tests/            # Vitest
│   └── web/                  # ランディングページ（Next.js 14 + Tailwind、Cloudflare Pages）
│       ├── app/
│       │   ├── page.tsx              # トップページ（Hero / Features / Demo / Pricing / FAQ / CTA）
│       │   ├── checkout/             # Stripe Checkout 成功・キャンセル画面
│       │   ├── download/             # .exe ダウンロード案内
│       │   ├── privacy/              # プライバシーポリシー
│       │   ├── terms/                # 利用規約
│       │   ├── tokushoho/            # 特定商取引法に基づく表記
│       │   ├── robots.ts / sitemap.ts # SEO
│       │   └── layout.tsx
│       ├── components/               # Hero / Features / Demo / FAQ / Pricing / CTA / Navbar / Footer / SignupModal
│       └── lib/                      # api.ts（Worker API クライアント） / github.ts（GitHub Releases）
│
├── tests/                    # ユニット + E2E テスト
├── scripts/                  # e2e-stripe-test.ps1 / analyze-latency.ts など
├── supabase/migrations/      # pgvector RAG マイグレーション
└── docs/
    ├── SETUP.md
    ├── PHASE_ROADMAP.md
    ├── TECH_STACK.md
    └── UI_DESIGN_GUIDELINES.md
```

---

## セットアップ

### 前提条件

- Node.js 22.x LTS 以上
- pnpm（最新版）
- Git
- Windows 10 / 11（64bit）※本番利用時

### 1. クローン & 依存関係インストール

```bash
git clone https://github.com/kuriyama920/Interview-automatic-bot.git
cd Interview-automatic-bot
pnpm install
```

### 2. 環境変数

`.env.example` をコピーして `.env` を作成します。

```bash
cp .env.example .env
```

```env
# プロキシモード（推奨）: APIキーは Worker 側で管理するため不要
API_BASE_URL=https://interview-bot-api.interviewautomaticbot92.workers.dev

# カスタムキー使用時のみ（オプション）
# SONIOX_API_KEY=xxx
# OPENAI_API_KEY=xxx
```

### 3. 開発サーバー起動

```bash
pnpm dev
```

### 4. Windows インストーラー生成

```bash
pnpm build:win        # NSIS インストーラー（.exe）
pnpm build:portable   # ポータブル版（インストール不要）
```

成果物は `dist-electron/` に出力されます。

---

## 使い方

1. アプリ起動後、Google アカウントでログイン
2. 左カラムから **履歴書 / 求人票 / 想定質問** をアップロード（PDF / DOCX 対応）
3. 「録音開始」ボタンを押下
4. 面接官の発言がリアルタイムに文字起こしされ、AI 回答がストリーミング表示される
5. 「AI回答生成」ボタンで手動再生成も可能

### WSL2 環境での動作確認

WSL2 ではマイク・システム音声を取得できません。動作確認のみであれば、Windows 側で `pnpm dev` を起動してください。WSL2 でビルド作業を行う場合は、UI のみの確認なら `音声ファイルでテスト` ボタンから `.wav` / `.mp3` を読み込めます。

---

## 開発コマンド

```bash
# 開発
pnpm dev                  # Electron 開発サーバー
pnpm build                # プロダクションビルド
pnpm build:win            # Windows .exe
pnpm build:portable       # ポータブル .exe

# テスト（Electron）
pnpm test                 # Vitest watch
pnpm test:unit            # ユニットテストのみ
pnpm test:ui              # Vitest UI
pnpm test:coverage        # カバレッジ計測
pnpm test:e2e             # Playwright E2E

# テスト（Cloudflare Worker）
cd apps/worker && npx vitest run             # ユニットテスト
cd apps/worker && npx vitest run --coverage  # カバレッジ付き

# Stripe E2E
.\scripts\e2e-stripe-test.ps1                         # 非認証テスト
.\scripts\e2e-stripe-test.ps1 -JwtToken "eyJhbG..."   # 認証テスト含む

# コード品質
pnpm format               # Prettier

# Cloudflare Workers
cd apps/worker && npx wrangler dev      # ローカル開発
cd apps/worker && npx wrangler deploy   # 本番デプロイ

# ランディングページ（apps/web）
cd apps/web && pnpm dev                 # Next.js 開発サーバー
cd apps/web && pnpm build               # 静的エクスポート（out/）
cd apps/web && npx wrangler pages deploy out  # Cloudflare Pages へデプロイ
```

---

## アーキテクチャ概要

### 音声入力 → STT

```
マイク         → getUserMedia()                ┐
                                                ├→ AudioContext でミキシング
システム音声   → setDisplayMediaRequestHandler ┘
                       ↓
              ScriptProcessor（PCM 16kHz）
                       ↓
              Soniox WebSocket（wss://stt-rt.soniox.com）
```

### AI 回答生成（二段生成）

```
[Speculative] interim 文字起こし
  → POST /api/ai/generate-v2 (phase=speculative)
  → gpt-5-nano（minimal）→ SSE で即時応答

[Committed] final 文字起こし
  → POST /api/ai/generate-v2 (phase=committed)
  → pgvector で RAG コンテキスト取得
  → gpt-5.4-nano → SSE → 使用量記録
```

- `store: false` 固定（OpenAI に履歴を保存しない）
- 会話文脈は直近 5 ターンの原文で管理

### 認証フロー

```
ログインボタン
  → shell.openExternal() で Google OAuth
  → /api/auth/callback
  → Deep Link: interview-bot://auth/callback?token=xxx
  → AuthService.handleAuthCallback() → JWT を electron-store に保存
```

---

## 料金プラン

| プラン | 月額 | STT | AI トークン | ドキュメント |
|--------|------|-----|------------|-------------|
| Free   | ¥0       | 30分     | 30,000      | 3件   |
| Pro    | ¥2,980   | 600分    | 500,000     | 50件  |
| Max    | ¥14,800  | 3,000分  | 5,000,000   | 200件 |

---

## セキュリティ

- API キーは **electron-store** で AES 暗号化保存
- すべての API リクエストで **JWT 認証** 必須
- OAuth `redirectUri` は許可リスト（`allowed-origins.ts`）で二重検証（書き込み時 + 読み取り時）
- ユーザー入力は独自バリデーション（`apps/worker/src/lib/validation.ts` / `ai-validation.ts`）で検証
- Worker 側で **CORS + レート制限** ミドルウェアを適用
- エラーメッセージはサニタイズし内部情報を漏らさない

---

## ライセンス

MIT License

---

## 免責事項

**重要**: このツールは教育・研究目的で開発されています。

- 実際の面接での使用は、多くの企業の規約に違反する可能性があります
- 本番面接での利用は推奨しません
- 使用は自己責任でお願いします
- 開発者は本ツールの利用結果について一切の責任を負いません

**推奨する用途**

- 面接練習・自己学習・スキル向上
- 想定質問のシミュレーション
- 企業の許可を得た上でのリアルタイム支援

---

## 参考リンク

- [Electron `desktopCapturer` API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Soniox Speech AI Docs](https://soniox.com/docs/stt/api-reference/websocket-api)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Hono Documentation](https://hono.dev/)
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns)

---

**最終更新**: 2026-05-14
