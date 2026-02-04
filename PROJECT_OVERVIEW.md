# プロジェクト概要 - Interview Automatic Bot

このドキュメントは、プロジェクト全体の概要と作成済みドキュメントの一覧です。

---

## 📚 作成済みドキュメント一覧

以下のドキュメントが作成されました：

### 1. メインドキュメント

| ファイル | 内容 | 読むべきタイミング |
|---------|------|-------------------|
| **[README.md](./README.md)** | プロジェクト概要、機能説明、セットアップ手順 | 最初に読む |
| **[DEVELOPMENT.md](./DEVELOPMENT.md)** | 詳細な開発ワークフロー、Phase別実装ガイド | 実装開始時 |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | システムアーキテクチャ、データフロー、技術設計 | 実装前の設計確認時 |
| **[DISCUSSION.md](./DISCUSSION.md)** | 技術的な決定事項、未解決の疑問点、壁打ち用 | **今すぐ読む！** |

### 2. セットアップ関連

| ファイル | 内容 |
|---------|------|
| **[docs/SETUP.md](./docs/SETUP.md)** | 開発環境構築の詳細手順 |
| **[.env.example](./.env.example)** | 環境変数テンプレート |
| **[.gitignore](./.gitignore)** | Git除外設定 |
| **[package.json](./package.json)** | 依存関係・スクリプト定義 |

---

## 🎯 プロジェクト要約

### 何を作るのか？

**Windows向けデスクトップアプリケーション**で、以下を実現します：

```
オンライン面接中の音声 → リアルタイム認識 → AI回答生成 → 透明表示
```

### なぜデスクトップアプリなのか？

Webブラウザでは以下が**技術的に不可能**です：
- ✅ システム音声キャプチャ（Zoom/Teamsの音声を取得）
- ✅ 透明オーバーレイ（画面共有に映らない）
- ✅ グローバルホットキー（アプリ外でも動作）

### 主要技術スタック

```yaml
フレームワーク: Electron 28.x
言語: TypeScript 5.3
UI: React + Tailwind CSS + DaisyUI
音声認識: Deepgram API（100-300ms遅延）
LLM: OpenAI GPT-4 Turbo
RAG: LangChain + Chroma（ローカルベクトルDB）
```

---

## 📊 参考プロジェクト・サービス

### オープンソースプロジェクト

| プロジェクト | 技術 | 参考部分 |
|------------|------|---------|
| [Interview-Assistant](https://github.com/nohairblingbling/Interview-Assistant) | Electron + TypeScript | 透明オーバーレイ実装 |
| [AI-powererd-interview-Assistant](https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant) | Next.js + Deepgram | RAG実装（Pinecone） |
| [interviewcopilot](https://github.com/hariiprasad/interviewcopilot) | Next.js + Azure Speech | UI設計 |
| [Ai-Interview-Assistant-Python](https://github.com/pixelpump/Ai-Interview-Assistant-Python) | Python + Eel | 音声キャプチャロジック |
| [ai-interview-assistant](https://github.com/Guna1610/ai-interview-assistant) | React + Express | 履歴書パーシング |
| [llm-interview-assistant](https://github.com/dmytrovoytko/llm-interview-assistant) | Python + Streamlit | RAG設計（Elasticsearch） |

### 商用サービス（参考資料）

| サービス | 特徴 | 参考にした点 |
|---------|------|------------|
| [Cluely](https://cluely.ai/) | 米国、a16z出資、透明オーバーレイ | セキュリティ設計（SOC2/GDPR準拠） |
| [CueMe](https://cueme.app/) | 日本発、Mac専用 | 日本語UI/UX、ホットキー実装 |
| [Interview Hunter](https://interviewhunter.com/) | 技術面接特化 | コーディング問題対応ロジック |
| [KanpeAI](https://kanpe.ai/) | 多言語対応 | 面接後の分析レポート機能 |

---

## 🗂️ プロジェクト構造（完成形）

```
interview-automatic-bot/
├── README.md                    ✅ 作成済み
├── DEVELOPMENT.md               ✅ 作成済み
├── ARCHITECTURE.md              ✅ 作成済み
├── DISCUSSION.md                ✅ 作成済み（壁打ち用）
├── PROJECT_OVERVIEW.md          ✅ このファイル
├── package.json                 ✅ 作成済み
├── .env.example                 ✅ 作成済み
├── .gitignore                   ✅ 作成済み
├── tsconfig.json                ⏳ Phase 0で作成
├── electron.vite.config.ts      ⏳ Phase 0で作成
│
├── src/
│   ├── main/                    ⏳ Electronメインプロセス
│   │   ├── index.ts
│   │   ├── window.ts
│   │   ├── hotkey.ts
│   │   └── audio/
│   │       └── capture.ts
│   ├── preload/                 ⏳ プリロードスクリプト
│   │   └── index.ts
│   ├── renderer/                ⏳ React UI
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── store/
│   │   └── index.html
│   └── services/                ⏳ ビジネスロジック
│       ├── stt.service.ts
│       ├── llm.service.ts
│       └── rag.service.ts
│
├── docs/
│   └── SETUP.md                 ✅ 作成済み
│
└── resources/                   ⏳ Phase 6で作成
    └── icon.ico
```

---

## 📅 開発スケジュール

| Phase | 期間 | 主要タスク | 成果物 |
|-------|------|-----------|--------|
| **Phase 0** | 1-2日 | プロジェクト初期化、環境構築 | 空のElectronアプリ起動 |
| **Phase 1** | 3-4日 | 音声認識実装（Deepgram） | リアルタイム文字起こし |
| **Phase 2** | 3-4日 | LLM統合（OpenAI） | AI回答生成 |
| **Phase 3** | 2-3日 | ステルスUI実装 | 透明オーバーレイ |
| **Phase 4** | 4-5日 | RAG実装 | 履歴書ベース回答 |
| **Phase 5** | 2-3日 | 設定・保存機能 | 設定画面・履歴保存 |
| **Phase 6** | 2-3日 | ビルド・配布 | **Windows .exe完成** |

**MVP完成**: Phase 3終了時（約2週間）
**製品版完成**: Phase 6終了時（約3-4週間）

---

## 💰 コスト見積もり

### API利用料金

**Deepgram**:
- 無料クレジット: $200
- 利用可能時間: 約46,000分（約767時間）
- 日常開発では無料枠内で完結

**OpenAI GPT-4 Turbo**:
- 想定: 1回答あたり500トークン（入力300 + 出力200）
- コスト: $0.003 + $0.006 = **$0.009/回答**
- 月100回答: 約$0.9
- 月1000回答: 約$9

**合計月額コスト**: 約$10以下（開発・個人利用）

---

## 🎯 機能要件（優先度順）

### MVP（必須機能）

- ✅ リアルタイム音声認識
- ✅ 質問自動検出
- ✅ AI回答生成
- ✅ 透明オーバーレイUI
- ✅ ホットキー操作（Ctrl+Shift+A）
- ✅ 設定管理（APIキー保存）

### Phase 2（推奨機能）

- 履歴書アップロード
- RAG回答生成
- 複数LLM対応（Claude/Gemini）
- 会話履歴保存

### Phase 3（オプション機能）

- 音声応答（TTS）
- Web検索統合
- 評価レポート生成
- クラウド同期

---

## 🚀 次のステップ（推奨順序）

### ステップ1: ドキュメント確認

以下の順序で読んでください：

1. **[DISCUSSION.md](./DISCUSSION.md)** ← **最優先！**
   - 技術的な決定事項を確認
   - 未解決の疑問点を議論

2. **[README.md](./README.md)**
   - プロジェクト全体像を把握

3. **[ARCHITECTURE.md](./ARCHITECTURE.md)**
   - システム設計を理解

### ステップ2: 壁打ちディスカッション

**[DISCUSSION.md](./DISCUSSION.md)** を開いて、以下を決定しましょう：

#### 今決めるべきこと（5つ）

1. **開発開始時期**
   - 今すぐPhase 0を開始するか？
   - 追加調査が必要か？

2. **開発期間の目標**
   - MVP（2週間）を目指すか？
   - 完全版（4週間）を目指すか？

3. **コスト上限**
   - OpenAI APIの月額上限は？（$10、$50、$100？）

4. **優先機能**
   - MVP必須機能は上記で良いか？
   - Phase 7で何を実装したいか？

5. **プロンプト方針**
   - 回答のトーン（です・ます調 vs だ・である調）
   - 文字数制限（200-300文字で良いか？）

### ステップ3: Phase 0開始

決定事項が固まったら：

```bash
# プロジェクト作成
npm create @quick-start/electron@latest interview-automatic-bot

cd interview-automatic-bot

# 依存関係インストール
pnpm install

# APIキー設定
cp .env.example .env
# .envを編集してAPIキーを記入

# 開発サーバー起動
pnpm dev
```

詳細は **[docs/SETUP.md](./docs/SETUP.md)** を参照

---

## 📝 重要な注意事項

### セキュリティ

- APIキー（`.env`）は**絶対にGitにコミットしない**
- electron-storeで暗号化保存
- 通信はすべてHTTPS/WSS

### 倫理

このツールは**教育・研究目的**です：
- 実際の面接での使用は企業規約違反の可能性
- 使用は自己責任
- 開発者は責任を負わない

### ライセンス

MIT License（自由に改変・配布可能）

---

## 🤝 サポート・連絡先

- **GitHub Issues**: [https://github.com/yourusername/interview-automatic-bot/issues](https://github.com/yourusername/interview-automatic-bot/issues)
- **ドキュメント**: このリポジトリの各種.mdファイル

---

## ✅ チェックリスト

開始前に以下を確認してください：

- [ ] Node.js v18.x以上をインストール済み
- [ ] pnpmをインストール済み（`npm install -g pnpm`）
- [ ] Deepgram APIキーを取得済み
- [ ] OpenAI APIキーを取得済み（支払い方法登録済み）
- [ ] Visual Studio Codeをインストール済み
- [ ] [DISCUSSION.md](./DISCUSSION.md)を読んで疑問点を整理済み
- [ ] 開発期間・優先機能を決定済み

すべてチェックできたら、Phase 0を開始しましょう！ 🚀

---

**最終更新**: 2026-02-01
**次のアクション**: [DISCUSSION.md](./DISCUSSION.md)を開いて壁打ち開始！
