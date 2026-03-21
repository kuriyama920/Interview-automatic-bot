# 技術スタック・職務経歴書用リファレンス

## プロジェクト概要

**リアルタイムAI面接支援SaaSプロダクト**（個人開発）

音声をリアルタイムで文字起こしし、AIが最適な回答をストリーミング提案するWindows向けデスクトップアプリケーション。Electronによるネイティブアプリ + Cloudflare Workersによるサーバーレスバックエンド + Supabase PostgreSQLによるデータ基盤で構成。Stripe決済によるサブスクリプション課金モデル（Free / Pro / Max）を実装済み。

**規模**: Electronアプリ + Cloudflare Workers API + Next.jsマーケティングサイトのpnpmモノレポ構成

---

## 技術スタック一覧

### フロントエンド（Electronデスクトップアプリ）

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| デスクトップフレームワーク | Electron | 28.x | Windows向けネイティブアプリ |
| UIフレームワーク | React | 18.2 | コンポーネントベースUI |
| 言語 | TypeScript | 5.3 | 全レイヤー（strict mode） |
| ビルドツール | electron-vite + Vite 5 | 2.0 | Electron統合ビルド・HMR |
| スタイリング | Tailwind CSS + DaisyUI | 3.4 / 4.6 | ユーティリティCSS + UIコンポーネント |
| 音声認識 | Deepgram SDK | 3.4 | WebSocketリアルタイムSTT |
| AI統合 | OpenAI SDK | 4.28 | GPT-5 Nano SSEストリーミング |
| ローカル保存 | electron-store | 8.1 | AES暗号化キーバリューストア |
| ロギング | Winston | 3.11 | 構造化ログ（console + file rotate） |
| インストーラー | electron-builder | 24.9 | NSIS + ポータブル版 |

### バックエンド（Cloudflare Workers API）

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| ランタイム | Cloudflare Workers | - | V8 Isolates サーバーレス |
| APIフレームワーク | Hono | 4.7 | 軽量Webフレームワーク |
| 言語 | TypeScript | 5.3 | strict mode |
| データベース | Supabase PostgreSQL | - | RDB + pgvector拡張 |
| ベクトル検索 | pgvector | - | コサイン類似度検索（1536次元） |
| AI | OpenAI API | 4.28 | GPT-5 Nano + text-embedding-3-small |
| 決済 | Stripe | 14.14 | Checkout + Customer Portal + Webhook |
| 認証 | Google OAuth 2.0 + JWT | - | HMAC-SHA256署名（Web Crypto API） |
| 音声認識 | Deepgram API | - | 一時トークン発行 |
| ドキュメント解析 | pdf-parse / mammoth | 1.1 / 1.6 | PDF・DOCX解析 |
| Cronジョブ | Cloudflare Cron Triggers | - | 月次使用量リセット |

### テスト・品質管理

| カテゴリ | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| テストフレームワーク | Vitest | 1.1 / 3.0 | ユニット・統合テスト |
| E2Eテスト | Playwright | 1.40 | ブラウザ・API自動テスト |
| Reactテスト | @testing-library/react | 14.1 | コンポーネントテスト |
| DOM環境 | happy-dom | 20.5 | 軽量DOM環境 |
| カバレッジ | @vitest/coverage-v8 | - | 80%以上（閾値設定済み） |
| リント | ESLint | 8.56 | TypeScript + React |
| フォーマット | Prettier | 3.2 | 統一コードスタイル |

### インフラ・CI/CD

| カテゴリ | 技術 | 用途 |
|---------|------|------|
| CI/CD | GitHub Actions | タグベース自動リリース |
| パッケージ管理 | pnpm | モノレポワークスペース |
| デプロイ（API） | Cloudflare Workers（wrangler） | サーバーレスデプロイ |
| デプロイ（Web） | Cloudflare Pages | 静的サイトホスティング |
| Node.js | v22.x LTS | .nvmrc指定 |

---

## アーキテクチャ設計

### 全体構成

```
┌───────────────────────────────────────────────┐
│           Electron Desktop App                │
│  React 18 + TypeScript + Tailwind CSS         │
│  (renderer / main / preload 3層分離)          │
└──────────────────┬────────────────────────────┘
                   │ IPC (contextIsolation)
                   │ HTTPS + JWT Bearer
                   ↓
┌───────────────────────────────────────────────┐
│        Cloudflare Workers API (Hono)          │
│  認証 / AI / STT / 決済 / ドキュメント / Q&A  │
└──────────────────┬────────────────────────────┘
                   │
      ┌────────────┼────────────┬──────────┐
      ↓            ↓            ↓          ↓
  Supabase     OpenAI API   Deepgram    Stripe
  PostgreSQL   GPT-5 Nano   Nova-2      Checkout
  + pgvector   Embeddings   WebSocket   Webhook
```

### Electronセキュリティ設計（3層分離）

- **contextIsolation: true** — レンダラーとメインプロセスの完全分離
- **nodeIntegration: false** — Node.js APIの無効化
- **preloadホワイトリスト** — 許可されたIPCチャネルのみ公開

### サービス層（Singletonパターン）

```
src/services/
├── auth.service.ts      # OAuth + JWT + 暗号化トークン管理
├── stt.service.ts       # Deepgram WebSocket接続管理
├── ai.service.ts        # SSEストリーミング + AbortController
├── context.service.ts   # RAGベクトル検索
├── questions.service.ts # 想定質問管理
└── logger.service.ts    # Winston構造化ログ
```

### React状態管理

- **React Context API** — 認証、ナビゲーション、Toast通知
- **カスタムフック13個** — useSTT, useAudioCapture, useAIResponse, useProgressiveAI 等
- **InterviewContext** — 面接セッション全状態の一元管理（表示時のみマウント）

---

## 主要な技術的実装

### 1. リアルタイム音声処理

**AudioWorklet + リサンプリング + PCM変換**

- AudioWorkletProcessor でメインスレッド非ブロッキング処理
- 線形補間リサンプリング（48kHz → 16kHz）
- Float32 → Int16 PCM変換
- マイク + システム音声（Zoom/Teams）の独立パイプライン
- `setDisplayMediaRequestHandler` によるloopbackキャプチャ
- 話者分離（sourceTag: "mic" / "system"）

### 2. Progressive AI（2層マッチング）

- **Layer 1**: ローカルキャッシュでビグラム類似度即時マッチング（<1ms）
- **Layer 2**: マッチなしの場合のみOpenAI SSEストリーミング生成
- 300msデバウンスによるAPI呼び出し最適化
- AbortControllerによる生成中断制御

### 3. SSEストリーミング（Server-Sent Events）

- Cloudflare Workers → Electron へのリアルタイムストリーミング
- フェーズ遷移通知（summary → detailed）
- 15秒タイムアウト付きread
- AbortSignalによるユーザー中断対応

### 4. RAG（Retrieval-Augmented Generation）

- ドキュメント（PDF/DOCX）のチャンク分割（500文字 / 50文字オーバーラップ）
- OpenAI text-embedding-3-small で1536次元ベクトル生成
- Supabase pgvector コサイン類似度検索（minSimilarity: 0.7, topK: 3）
- バッチEmbedding（20件/バッチ、100ms間隔）

### 5. Google OAuth 2.0 + JWT認証

- セッション型OAuthフロー（CSRF対策: 32バイトランダムState）
- Deep Link プロトコル（`interview-bot://auth/callback`）
- JWT生成・検証（HMAC-SHA256、Web Crypto API）
- タイミングセーフ比較（`crypto.timingSafeEqual`）
- electron-store AES暗号化トークン保存
- 5分バッファ付きトークン有効期限チェック

### 6. Stripe決済統合

- Checkout Session による月次サブスクリプション
- Customer Portal（プラン変更・解約）
- Webhook署名検証（stripe-signature）
- `getOrCreateStripeCustomer` による顧客管理
- 競合状態対応（orphan customer自動クリーンアップ）

### 7. 使用量管理（アトミック操作）

- Supabase RPC `check_and_reserve_usage` で予約 → 実行 → 差分調整
- 同時リクエストの競合状態を排除
- Cron Triggers（毎月1日 00:00 UTC）で月次リセット
- リソース別制限（STT分数 / AIトークン / ドキュメント数）

### 8. Deepgram WebSocket STT

- Nova-2モデル（日本語）
- interim_results + is_final の二重ストリーム
- VAD（音声活動検知）による無音区間自動検出
- 5秒間隔keepAlive
- 一時トークン発行（10分TTL）+ フォールバック機構

---

## セキュリティ対策

| 領域 | 実装 |
|------|------|
| IPC通信 | ホワイトリスト制御 + contextIsolation |
| 認証 | JWT(HS256) + OAuth State検証 + トークン暗号化保存 |
| 署名検証 | タイミングセーフ比較（timingSafeEqual） |
| CORS | 多層Origin検証（ミドルウェア + リダイレクトURL + Stripe URL） |
| 入力バリデーション | 関数ベース検証（文字列長・型・範囲チェック） |
| シークレット管理 | Cloudflare Secrets（環境変数、コード内ハードコーディング禁止） |
| Webhook | Stripe署名検証（replay attack防止） |
| エラーメッセージ | 内部情報を含まないサニタイズ済みメッセージ |

---

## テスト戦略

| レイヤー | 対象 | テスト数 | ツール |
|---------|------|---------|-------|
| ユニット | サービス層、コンポーネント、ユーティリティ | 30+ | Vitest + Testing Library |
| 統合 | IPC通信、サービス間連携 | 10+ | Vitest |
| Workers | JWT、ミドルウェア、ルート | 17 | Vitest + cloudflare/vitest-pool-workers |
| E2E | API統合、マーケティングサイト | 2スイート | Playwright |

**カバレッジ閾値（Workers）**: Statements 80% / Branches 70% / Functions 80% / Lines 80%

---

## パフォーマンス最適化

| 項目 | 手法 | 効果 |
|------|------|------|
| 遅延ロード | InterviewPage表示時のみhooks初期化 | メモリ削減 |
| メモ化 | useMemoで依存性最小化 | 不要レンダリング削減 |
| デバウンス | Progressive AI 300msデバウンス | APIコール削減 |
| キャッシング | 想定質問ビグラムキャッシュ | マッチング<1ms |
| TTFT最適化 | GPT-5 Nano reasoning_effort: minimal | ~0.77秒 |
| Smart Placement | Cloudflare CPU最適化地域自動選択 | レイテンシ削減 |
| バッチ処理 | Embedding 20件/バッチ | レート制限対策 |

---

## ビジネスモデル

| プラン | 月額 | STT | AIトークン | ドキュメント |
|--------|------|-----|-----------|-------------|
| Free | ¥0 | 30分 | 30,000 | 3件 |
| Pro | ¥2,980 | 600分 | 500,000 | 50件 |
| Max | ¥14,800 | 3,000分 | 5,000,000 | 200件 |

- 損益分岐点: Pro約2人で固定費回収
- 粗利率: Pro 70% / Max 68%

---

## 開発フェーズ（全8フェーズ完了）

| Phase | 内容 | 技術的ハイライト |
|-------|------|----------------|
| 1-4 | 音声認識・AI回答・コンテキスト・UI | Deepgram WebSocket, OpenAI SSE, React Context |
| 5 | SaaS基盤（認証・DB） | Google OAuth 2.0, JWT, Supabase |
| 6 | クラウドRAG（pgvector） | Embedding, ベクトル検索, チャンク分割 |
| 6.5 | システム音声キャプチャ | AudioWorklet, desktopCapturer loopback |
| 7 | Stripe決済 + サブスクリプション | Checkout, Webhook, Customer Portal |
| 8 | APIプロキシ（ユーザーAPIキー不要） | プロキシモード, 使用量管理RPC |
| - | Cloudflare Workers移行 | Vercel → Cloudflare Workers + Pages |

---

## 転職アピールポイント

### 技術的な強み

1. **フルスタック開発**: デスクトップ（Electron）+ サーバーレスAPI（Cloudflare Workers）+ DB（Supabase）を一人で設計・実装
2. **リアルタイム音声処理**: AudioWorklet、リサンプリング、PCM変換、話者分離など低レベル音声処理
3. **AI/LLM統合**: SSEストリーミング、RAG（pgvector）、Progressive AI（2層マッチング）
4. **決済システム**: Stripe Checkout/Webhook/Customer Portal によるサブスクリプション課金
5. **認証設計**: OAuth 2.0 + JWT + タイミングセーフ比較 + 暗号化トークン保存
6. **セキュリティ意識**: CORS多層検証、入力バリデーション、contextIsolation、シークレット管理
7. **テスト文化**: 50+テスト、80%カバレッジ閾値、ユニット/統合/E2E
8. **モノレポ管理**: pnpmワークスペースによる複数アプリ管理
9. **CI/CD**: GitHub Actions自動リリース + Cloudflare Workersデプロイ
10. **プロダクト設計**: 3段階課金モデル、コスト構造分析、損益分岐点算出

### 使用技術キーワード（職務経歴書向け）

**言語**: TypeScript (strict mode)
**フロントエンド**: React 18, Tailwind CSS, DaisyUI, Electron 28, Vite 5
**バックエンド**: Cloudflare Workers, Hono, Node.js
**データベース**: PostgreSQL (Supabase), pgvector
**AI/ML**: OpenAI API (GPT-5), RAG, Embedding, SSEストリーミング
**音声処理**: Deepgram (Nova-2), WebSocket, AudioWorklet, PCM
**決済**: Stripe (Checkout, Webhook, Customer Portal)
**認証**: Google OAuth 2.0, JWT (HMAC-SHA256)
**テスト**: Vitest, Playwright, Testing Library
**インフラ**: Cloudflare Workers/Pages, GitHub Actions
**ツール**: pnpm, ESLint, Prettier, electron-builder, wrangler
