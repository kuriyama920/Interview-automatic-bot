# Interview Automatic Bot

リアルタイムAI面接支援デスクトップアプリケーション（Windows対応）

## 概要

このプロジェクトは、オンライン面接中にリアルタイムで質問を認識し、AI（LLM）による回答例を生成する**Windows向けデスクトップアプリケーション**です。

### 主要機能

- **リアルタイム音声認識**: Deepgram APIによる超低遅延（<300ms）文字起こし
- **AI回答生成**: OpenAI GPT-4による質問への回答例生成
- **透明オーバーレイUI**: 画面共有時に映らないステルス表示
- **グローバルホットキー**: `Ctrl+Shift+A`で瞬時に表示/非表示
- **履歴書RAG機能**: アップロードした履歴書を元にコンテキストを考慮した回答生成
- **会話履歴保存**: 面接内容の自動記録・エクスポート

### なぜデスクトップアプリが必要か？

Webブラウザでは以下の機能が**技術的に不可能**です：

| 機能 | デスクトップ | Web | 理由 |
|------|------------|-----|------|
| システム音声キャプチャ | ✅ | ❌ | ブラウザはZoom/Teams等の音声を取得不可 |
| 透明オーバーレイ | ✅ | ❌ | OSレベルのウィンドウ操作が必要 |
| 画面共有時に非表示 | ✅ | ❌ | ブラウザタブは必ず映る |
| グローバルホットキー | ✅ | ❌ | タブフォーカス外では動作不可 |

→ **本格的な面接支援にはデスクトップアプリが必須**

---

## 技術スタック

### コア技術

```yaml
言語: TypeScript 5.3+
フレームワーク: Electron 28.x
ビルドツール: Electron Vite 2.0
パッケージマネージャー: npm / pnpm
```

### 主要ライブラリ

```json
{
  "音声認識": "@deepgram/sdk ^3.4.0",
  "LLM": "openai ^4.28.0",
  "UI": "react ^18.2.0 + tailwindcss ^3.4.0 + daisyui ^4.6.0",
  "状態管理": "@reduxjs/toolkit ^2.0.0",
  "RAG": "langchain ^0.1.0",
  "ベクトルDB": "chromadb (ローカル)",
  "PDF解析": "pdf-parse ^1.1.1",
  "ストレージ": "electron-store ^8.1.0 (暗号化)",
  "ログ": "winston ^3.11.0"
}
```

### インフラ・API

- **Deepgram API**: リアルタイム音声認識（無料枠: $200クレジット）
- **OpenAI API**: GPT-4 Turbo（従量課金）
- **Chroma/FAISS**: ローカルベクトルデータベース

---

## 参考プロジェクト・サービス

### オープンソースプロジェクト

本プロジェクトは以下のOSSプロジェクトを参考に設計しています：

| プロジェクト | 技術 | 参考にした部分 | URL |
|------------|------|--------------|-----|
| **Interview-Assistant** | Electron + TypeScript | 透明オーバーレイ実装、Deepgram統合 | [GitHub](https://github.com/nohairblingbling/Interview-Assistant) |
| **AI-powererd-interview-Assistant** | Next.js + Deepgram | RAG実装（Pinecone + LangChain）、複数LLM対応 | [GitHub](https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant) |
| **interviewcopilot** | Next.js + Azure Speech | Azure Speech SDK統合、UI設計 | [GitHub](https://github.com/hariiprasad/interviewcopilot) |
| **Ai-Interview-Assistant-Python** | Python + Eel | システム音声キャプチャロジック | [GitHub](https://github.com/pixelpump/Ai-Interview-Assistant-Python) |
| **ai-interview-assistant** | React + Express | 履歴書パーシング、セッション管理 | [GitHub](https://github.com/Guna1610/ai-interview-assistant) |
| **llm-interview-assistant** | Python + Streamlit | RAG設計（Elasticsearch + PostgreSQL） | [GitHub](https://github.com/dmytrovoytko/llm-interview-assistant) |

### 商用サービス（参考資料）

以下の商用サービスも技術仕様・UI/UX設計の参考にしています：

| サービス | 特徴 | 技術・機能 |
|---------|------|-----------|
| **[Cluely](https://cluely.ai/)** | 米国スタートアップ、a16z出資 | ・透明オーバーレイ<br>・12言語対応（応答300ms、95%精度）<br>・フォローアップメール自動生成<br>・SOC2/ISO27001/GDPR準拠 |
| **[CueMe](https://cueme.app/)** | 日本発、Mac専用アプリ | ・Whisperベース音声認識<br>・Command+Tホットキー<br>・ステルスモード（画面共有非表示）<br>・履歴書ベース回答生成 |
| **[Interview Hunter](https://interviewhunter.com/)** | 技術面接特化ツール | ・コーディング問題対応<br>・リアルタイム回答提案<br>・LeetCode/HackerRank連携 |
| **[KanpeAI](https://kanpe.ai/)** | オンライン面接支援 | ・音声認識＋AI回答<br>・複数言語対応<br>・面接後の分析レポート |

**参考ポイント**:
- Cluely: セキュリティ・コンプライアンス設計
- CueMe: 日本語UI/UX、ホットキー実装
- Interview Hunter: 技術面接特化の回答ロジック
- KanpeAI: 分析・レポート機能

---

## プロジェクト構造

```
interview-automatic-bot/
├── README.md                          # このファイル
├── DEVELOPMENT.md                     # 開発ガイド（詳細ワークフロー）
├── ARCHITECTURE.md                    # アーキテクチャ設計書
├── package.json                       # 依存関係・スクリプト定義
├── pnpm-lock.yaml                     # 依存バージョンロック
├── tsconfig.json                      # TypeScript設定
├── tsconfig.node.json                 # Node.js用TS設定
├── electron.vite.config.ts            # Electron Vite設定
├── .eslintrc.json                     # ESLint設定
├── .prettierrc.json                   # Prettier設定
├── .env.example                       # 環境変数テンプレート
├── .gitignore
│
├── src/
│   ├── main/                          # Electronメインプロセス
│   │   ├── index.ts                   # エントリーポイント
│   │   ├── window.ts                  # ウィンドウ管理（透明化・オーバーレイ）
│   │   ├── hotkey.ts                  # グローバルホットキー
│   │   ├── ipc.ts                     # IPC通信ハンドラ
│   │   └── audio/
│   │       ├── capture.ts             # システム音声キャプチャ
│   │       └── stream.ts              # オーディオストリーム管理
│   │
│   ├── preload/                       # プリロードスクリプト
│   │   └── index.ts                   # コンテキストブリッジ定義
│   │
│   ├── renderer/                      # レンダラープロセス（React UI）
│   │   ├── src/
│   │   │   ├── App.tsx                # ルートコンポーネント
│   │   │   ├── main.tsx               # エントリーポイント
│   │   │   ├── index.css              # Tailwindインポート
│   │   │   │
│   │   │   ├── components/            # UIコンポーネント
│   │   │   │   ├── TranscriptionView.tsx   # 文字起こし表示
│   │   │   │   ├── AnswerView.tsx          # AI回答表示
│   │   │   │   ├── SettingsPanel.tsx       # 設定画面
│   │   │   │   ├── HistoryPanel.tsx        # 会話履歴
│   │   │   │   └── ResumeUploader.tsx      # 履歴書アップロード
│   │   │   │
│   │   │   ├── hooks/                 # カスタムフック
│   │   │   │   ├── useDeepgram.ts          # Deepgram接続
│   │   │   │   ├── useOpenAI.ts            # OpenAI接続
│   │   │   │   ├── useHotkey.ts            # ホットキー制御
│   │   │   │   └── useRAG.ts               # RAG機能
│   │   │   │
│   │   │   ├── store/                 # Redux状態管理
│   │   │   │   ├── index.ts                # Store設定
│   │   │   │   ├── transcriptSlice.ts      # 文字起こし状態
│   │   │   │   ├── answerSlice.ts          # 回答状態
│   │   │   │   └── settingsSlice.ts        # 設定状態
│   │   │   │
│   │   │   └── types/                 # 型定義
│   │   │       ├── electron.d.ts           # Electron API型
│   │   │       └── index.ts                # 共通型
│   │   │
│   │   └── index.html                 # HTMLテンプレート
│   │
│   └── services/                      # ビジネスロジック（共通）
│       ├── stt.service.ts             # 音声認識サービス（Deepgram）
│       ├── llm.service.ts             # LLMサービス（OpenAI）
│       ├── rag.service.ts             # RAGサービス（LangChain + Chroma）
│       ├── storage.service.ts         # ローカルストレージ（electron-store）
│       ├── logger.service.ts          # ロガー（Winston）
│       └── question-detector.ts       # 質問検出ロジック
│
├── resources/                         # アプリリソース
│   ├── icon.png                       # アプリアイコン（PNG）
│   ├── icon.ico                       # Windowsアイコン
│   └── installer/                     # インストーラー設定
│       └── nsis-config.nsh            # NSIS設定
│
├── tests/                             # テストコード
│   ├── unit/                          # 単体テスト
│   └── e2e/                           # E2Eテスト（Playwright）
│
└── docs/                              # ドキュメント
    ├── API.md                         # API仕様
    ├── SETUP.md                       # セットアップ手順
    └── TROUBLESHOOTING.md             # トラブルシューティング
```

---

## セットアップ手順

### 前提条件

- **Node.js**: v18.x LTS以上（[ダウンロード](https://nodejs.org/)）
- **npm** または **pnpm**: 最新版
- **Git**: 最新版
- **Windows 10/11**: 64bit

### 1. リポジトリクローン

```bash
git clone https://github.com/yourusername/Interview-automatic-bot.git
cd Interview-automatic-bot
```

### 2. 依存関係インストール

```bash
# npmの場合
npm install

# pnpmの場合（推奨）
pnpm install
```

### 3. 環境変数設定

`.env.example`をコピーして`.env`を作成：

```bash
cp .env.example .env
```

`.env`に以下を記載：

```env
# Deepgram API (https://console.deepgram.com/)
DEEPGRAM_API_KEY=your_deepgram_api_key_here

# OpenAI API (https://platform.openai.com/api-keys)
OPENAI_API_KEY=your_openai_api_key_here

# オプション: Anthropic Claude
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 4. 開発サーバー起動

```bash
npm run dev
```

→ Electronアプリが起動します

### 5. ビルド（Windows .exe作成）

```bash
npm run build:win
```

→ `dist/`フォルダに実行ファイルが生成されます

---

## 開発ワークフロー

詳細は **[DEVELOPMENT.md](./DEVELOPMENT.md)** を参照してください。

### フェーズ概要

| Phase | 期間 | 内容 | 成果物 |
|-------|------|------|--------|
| **Phase 0** | 1-2日 | プロジェクト初期化 | package.json、基本構造 |
| **Phase 1** | 3-4日 | 音声認識実装 | Deepgram統合、リアルタイム文字起こし |
| **Phase 2** | 3-4日 | LLM統合 | OpenAI統合、回答生成 |
| **Phase 3** | 2-3日 | ステルスUI実装 | 透明オーバーレイ、ホットキー |
| **Phase 4** | 4-5日 | RAG実装 | 履歴書解析、ベクトル検索 |
| **Phase 5** | 2-3日 | 設定・保存機能 | 設定画面、会話履歴保存 |
| **Phase 6** | 2-3日 | ビルド・配布 | Windows .exeリリース |

**合計開発期間**: 約3-4週間（MVP完成まで約2週間）

---

## 使用方法

### 1. アプリ起動

- デスクトップの`InterviewBot`アイコンをダブルクリック
- または`InterviewBot.exe`を実行

### 2. 初期設定

1. 設定アイコンをクリック
2. Deepgram APIキーを入力
3. OpenAI APIキーを入力
4. モデル選択（GPT-4推奨）
5. ホットキー設定（デフォルト: `Ctrl+Shift+A`）

### 3. 履歴書アップロード（オプション）

1. 「履歴書アップロード」ボタンをクリック
2. PDF/DOCXファイルを選択
3. 自動的に解析・インデックス化

### 4. 面接中の使用

1. Zoom/Teams等で面接開始
2. アプリは自動的にバックグラウンドで動作
3. 面接官の質問を自動認識
4. `Ctrl+Shift+A`を押すと回答が表示
5. もう一度押すと非表示

### 5. 会話履歴確認

- 「履歴」タブで過去の面接記録を確認
- JSON/TXTでエクスポート可能

---

## トラブルシューティング

### 音声が認識されない

- マイク権限を確認（Windows設定 → プライバシー → マイク）
- Deepgram APIキーが正しいか確認
- インターネット接続を確認

### 透明オーバーレイが表示されない

- Windows 10/11のバージョンを確認（最新推奨）
- グラフィックドライバを更新
- アプリを管理者として実行

### ホットキーが動作しない

- 他のアプリと競合していないか確認
- 設定から別のキーに変更

詳細は **[docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)** を参照

---

## ライセンス

MIT License

---

## 免責事項

**重要**: このツールは教育・研究目的で開発されています。

- 面接での使用は多くの企業の規約に違反する可能性があります
- 実際の面接での使用は推奨されません
- 開発者は本ツールの使用による結果について一切の責任を負いません
- 使用は自己責任でお願いします

**倫理的な使用を推奨**:
- 面接練習ツールとして使用
- 自己学習・スキル向上のため
- 企業の許可を得た上での使用

---

## コントリビューション

プルリクエスト・Issue歓迎です！

1. このリポジトリをフォーク
2. フィーチャーブランチ作成（`git checkout -b feature/amazing-feature`）
3. コミット（`git commit -m 'Add amazing feature'`）
4. プッシュ（`git push origin feature/amazing-feature`）
5. プルリクエスト作成

---

## 参考資料

- [Electron公式ドキュメント](https://www.electronjs.org/docs)
- [Deepgram API Docs](https://developers.deepgram.com/)
- [OpenAI API Reference](https://platform.openai.com/docs/api-reference)
- [LangChain Documentation](https://js.langchain.com/docs/)

---

## 開発チーム

- **開発者**: [Your Name]
- **GitHub**: [https://github.com/yourusername](https://github.com/yourusername)

---

**最終更新**: 2026-02-01
