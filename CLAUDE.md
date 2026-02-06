# CLAUDE.md

Claude Codeがこのリポジトリで作業する際のガイダンス。

## プロジェクト概要

リアルタイムAI面接支援デスクトップアプリ（Windows対応）。音声をリアルタイム文字起こしし、AIが最適な回答を提案。

## 技術スタック

### Electron デスクトップ
| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Electron 28.x + React 18 |
| ビルド | electron-vite 2.0, Vite 5 |
| 言語 | TypeScript 5.3 |
| スタイル | Tailwind CSS 3.4 + DaisyUI 4.6 |
| 音声認識 | Deepgram SDK 3.4 (WebSocket) |
| 音声キャプチャ | Electron desktopCapturer + setDisplayMediaRequestHandler |
| AI | OpenAI API 4.28 (GPT-5) |
| ローカル保存 | electron-store 8.1 (AES暗号化) |

### SaaSバックエンド（Vercel）
| カテゴリ | 技術 |
|---------|------|
| API | Vercel Serverless Functions |
| 認証 | Google OAuth 2.0 + JWT |
| DB | Supabase PostgreSQL + pgvector |
| 決済 | Stripe Checkout (Phase 7) |

## コマンド

```bash
pnpm dev              # 開発サーバー
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー
pnpm test             # テスト実行
pnpm lint             # ESLint
pnpm format           # Prettier
```

## プロジェクト構造

```
src/
├── main/                 # Electronメインプロセス
│   ├── index.ts          # エントリーポイント + Deep Link
│   └── ipc.ts            # IPC通信ハンドラー
├── preload/              # プリロードスクリプト
├── renderer/src/         # Reactアプリ
│   ├── App.tsx           # メインコンポーネント
│   ├── hooks/            # カスタムフック
│   │   ├── useAuth.ts
│   │   ├── useSTT.ts
│   │   ├── useAudioCapture.ts
│   │   ├── useAIResponse.ts
│   │   └── useDocuments.ts
│   └── components/       # UIコンポーネント
├── services/             # 共有サービス（メインプロセス）
│   ├── auth.service.ts
│   ├── stt.service.ts
│   ├── ai.service.ts
│   └── context.service.ts
└── types/                # 型定義

apps/api/                 # Vercel API
├── api/
│   ├── auth/             # OAuth
│   ├── documents/        # ドキュメントCRUD + 検索
│   ├── stripe/           # Phase 7: 決済
│   └── stt/, ai/         # Phase 8: APIプロキシ
└── lib/                  # ユーティリティ

docs/
├── PHASE_ROADMAP.md      # Phase 6.5-9 詳細実装計画
└── UI_DESIGN_GUIDELINES.md
```

## 開発フェーズ

| Phase | 内容 | ステータス |
|-------|------|-----------|
| 1-4 | 音声認識・AI回答・コンテキスト・UI | ✅ 完了 |
| 5 | SaaS基盤（認証・DB） | ✅ 完了 |
| 6 | クラウドRAG（pgvector） | ✅ 完了 |
| **6.5** | **システム音声キャプチャ** | 🔜 **次** |
| 7 | Stripe決済 + Webダッシュボード | ⏳ 予定 |
| 8 | APIプロキシ（ユーザーAPIキー不要） | ⏳ 予定 |

> 詳細実装計画: [docs/PHASE_ROADMAP.md](docs/PHASE_ROADMAP.md)

## データフロー

### 音声入力 → STT
```
マイク入力     → getUserMedia()                → AudioContext
システム音声   → setDisplayMediaRequestHandler  → AudioContext (Phase 6.5)
                        ↓ ミキシング
                 ScriptProcessor → PCM 16kHz → Deepgram
```

### AI回答生成
```
質問 → /api/documents/search → pgvector類似検索 → 関連コンテキスト
    → OpenAI GPT-5 → ストリーミング回答
```

### 認証フロー
```
ログインボタン → shell.openExternal() → Google OAuth
    → /api/auth/callback → interview-bot://auth/callback?token=xxx
    → AuthService.handleAuthCallback() → JWT保存
```

## ビジネスモデル

| プラン | 月額 | STT | AIトークン | ドキュメント |
|--------|------|-----|-----------|-------------|
| Free | ¥0 | 60分 | 50,000 | 5件 |
| Pro | ¥1,980 | 600分 | 500,000 | 50件 |
| Enterprise | ¥9,800 | 無制限 | 無制限 | 無制限 |

## 環境変数

### Electron（.env）
```env
# Phase 8完了後は不要
DEEPGRAM_API_KEY=xxx
OPENAI_API_KEY=xxx

# SaaS接続
API_BASE_URL=https://api-kuriyama-natos-projects.vercel.app
```

### Vercel API
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
JWT_SECRET=xxx
# Phase 7-8
STRIPE_SECRET_KEY=xxx
DEEPGRAM_API_KEY=xxx
OPENAI_API_KEY=xxx
```

## 主要パターン

### IPC通信
```typescript
// メインプロセス
ipcMain.handle('channel:action', async (_, data) => {
  return { success: true, data: result }
})

// レンダラー
const result = await window.electron.channel.action(data)
```

### サービス層
- シングルトン（export const xxxService = new XxxService()）
- async/await + try/catch
- Winston ロギング

### React Hooks
- useXxx パターン
- 状態: data, isLoading, error
- クリーンアップ: useEffect return でリスナー解除

## 注意事項

### 重要
- パッケージ管理は **pnpm** を使用
- 音声データは **16kHz, 16bit PCM** でDeepgramに送信
- Deep Linkプロトコル: `interview-bot://`
- WSL2環境ではシステム音声キャプチャ不可（Windows側で実行必要）

### セキュリティ
- APIキーはelectron-storeでAES暗号化保存
- JWT認証必須（全APIリクエスト）
- ユーザー入力は必ずバリデーション

### コード品質
- 最小カバレッジ: 80%
- ESLint + Prettier 必須
- コンポーネントは小さく保つ（200-400行）
- イミュータブルパターン使用

## 参考リンク

- [Electron desktopCapturer API](https://www.electronjs.org/docs/latest/api/desktop-capturer)
- [Deepgram SDK](https://developers.deepgram.com/)
- [Supabase pgvector](https://supabase.com/docs/guides/ai/vector-columns)
