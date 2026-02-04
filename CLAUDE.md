# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

リアルタイムAI面接支援デスクトップアプリケーション（Windows対応）。面接中の音声をリアルタイムで文字起こしし、AIが最適な回答を提案します。

## 技術スタック

- **フレームワーク**: Electron + React 18
- **ビルドツール**: electron-vite, Vite 5
- **言語**: TypeScript 5.3
- **スタイリング**: Tailwind CSS + DaisyUI
- **状態管理**: Redux Toolkit
- **テスト**: Vitest + Testing Library + Playwright
- **音声認識**: Deepgram SDK (WebSocket)
- **AI**: OpenAI API + LangChain

## コマンド

```bash
# 開発
pnpm dev              # 開発サーバー起動

# ビルド
pnpm build            # プロダクションビルド
pnpm build:win        # Windows用インストーラー作成
pnpm build:portable   # ポータブル版作成

# テスト
pnpm test             # テスト実行
pnpm test:ui          # テストUI表示
pnpm test:coverage    # カバレッジレポート

# コード品質
pnpm lint             # ESLint実行
pnpm lint:fix         # ESLint自動修正
pnpm format           # Prettier実行
```

## プロジェクト構造

```
src/
├── main/              # Electronメインプロセス
│   ├── index.ts       # エントリーポイント
│   └── ipc.ts         # IPC通信ハンドラー
├── preload/           # プリロードスクリプト
│   └── index.ts       # Electron API公開
├── renderer/          # Reactアプリ（レンダラープロセス）
│   └── src/
│       ├── App.tsx    # メインコンポーネント
│       ├── hooks/     # カスタムフック
│       │   ├── useSTT.ts         # STT接続管理
│       │   └── useAudioCapture.ts # 音声キャプチャ
│       └── utils/
│           └── logger.ts  # レンダラー用ロガー
├── services/          # 共有サービス
│   ├── stt.service.ts     # Deepgram STTサービス
│   └── logger.service.ts  # Winston ロガー
└── types/             # 型定義
    └── electron.d.ts

tests/
├── unit/              # ユニットテスト
├── integration/       # 統合テスト
└── setup.ts           # テストセットアップ
```

## アーキテクチャ

### プロセス間通信 (IPC)

```
Renderer Process          Main Process
     │                         │
     │  stt:start(apiKey)      │
     ├────────────────────────►│
     │                         ├──► Deepgram WebSocket接続
     │  stt:audio(buffer)      │
     ├────────────────────────►│
     │                         ├──► 音声データ送信
     │  stt:transcript         │
     │◄────────────────────────┤
     │                         │
```

### データフロー

1. **音声入力**: AudioContext → ScriptProcessor → PCM 16kHz
2. **STT処理**: Main Process → Deepgram WebSocket → 文字起こし結果
3. **UI更新**: IPC → Renderer → React State → 画面表示

## 開発フェーズ

- **Phase 1**: 音声認識（Deepgram STT）✓ 実装済み
- **Phase 2**: AI回答生成（OpenAI/LangChain）
- **Phase 3**: コンテキスト管理（履歴書/求人票解析）
- **Phase 4**: UI/UX改善

## 環境変数

`.env`ファイルに以下を設定：

```
DEEPGRAM_API_KEY=your_deepgram_api_key
OPENAI_API_KEY=your_openai_api_key
```

## テスト方針

- 最小カバレッジ目標: 80%
- ユニットテスト: hooks, services
- 統合テスト: IPC通信
- E2Eテスト: 重要なユーザーフロー

## 注意事項

- パッケージ管理は `pnpm` を使用
- Electronの `ipcMain.handle` / `ipcRenderer.invoke` でIPC通信
- 音声データは16kHz, 16bit PCMでDeepgramに送信
- ロギングはWinston（Main）/ 軽量ロガー（Renderer）を使用
