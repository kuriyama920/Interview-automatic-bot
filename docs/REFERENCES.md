# 参考資料・関連サービス一覧

このドキュメントでは、本プロジェクトの設計・実装で参考にした商用サービスとOSSプロジェクトの詳細をまとめています。

---

## 目次

1. [商用サービス](#商用サービス)
2. [オープンソースプロジェクト](#オープンソースプロジェクト)
3. [技術的な参考ポイント](#技術的な参考ポイント)

---

## 商用サービス

これらの商用サービスは機能設計・UI/UX・セキュリティ対策の参考にしています。

### 1. Cluely（クルーリー）

**公式サイト**: [https://cluely.ai/](https://cluely.ai/)

**概要**:
米国スタートアップが開発した「見えないAIアシスタント」。2025年にa16zなどから約15億円を調達し話題になった。

**主要機能**:
- 透明なオーバーレイ上にリアルタイムで回答例・要約を表示
- 画面共有中も相手に気づかれない設計
- 音声認識と画面キャプチャで発言内容を取得
- LLMにより回答を生成

**技術仕様**:
- 12ヶ国語対応の自動文字起こし
- 応答時間: 約300ms
- 精度: 95%
- 終了後のフォローアップメール自動作成

**セキュリティ**:
- SOC2準拠
- ISO27001準拠
- GDPR準拠
- CCPA準拠
- HIPAA準拠
- サイト上に認証ロゴを掲載

**本プロジェクトでの参考ポイント**:
- ✅ セキュリティ・コンプライアンス体制の設計
- ✅ 透明オーバーレイの実装方針
- ✅ 複数言語対応のアーキテクチャ

---

### 2. CueMe（キューミー）

**公式サイト**: [https://cueme.app/](https://cueme.app/)

**概要**:
日本のスタートアップが提供する面接支援アプリ。Mac用アプリとしてApp Storeで公開。

**主要機能**:
- リアルタイムに面接官の質問音声を文字起こし
- 履歴書などを踏まえて最適な回答例を生成
- 常駐型UIで、グローバルホットキー（Command+T等）で表示/非表示可能
- OSレベルの透明オーバーレイによる「ステルスモード」

**技術仕様**:
- 音声認識: Whisperベースの独自モデル採用
- プラットフォーム: Mac専用（App Store公開）
- 画面共有ツールにも映らない設計
- 無料プランでも利用可能

**実績**:
- 2000以上のユーザー
- 成功率85%向上を実感（自社調べ）

**本プロジェクトでの参考ポイント**:
- ✅ 日本語UI/UXの設計
- ✅ Command+T（Ctrl+Shift+A）ホットキーの実装
- ✅ Whisperベース音声認識の採用例
- ✅ ステルスモードの実装方法

---

### 3. Interview Hunter（インタビューハンター）

**公式サイト**: [https://interviewhunter.com/](https://interviewhunter.com/)

**概要**:
技術面接に特化したAI面接支援ツール。コーディング問題の解答生成に強み。

**主要機能**:
- コーディング問題のリアルタイム認識
- アルゴリズム・データ構造の解答例生成
- LeetCode/HackerRank/CodeSignal連携
- 画面共有中でも非表示

**技術仕様**:
- 画面キャプチャ＋OCRでコーディング問題を取得
- 複数のプログラミング言語に対応（Python、Java、C++等）
- リアルタイムコード提案

**本プロジェクトでの参考ポイント**:
- ✅ 技術面接特化の回答生成ロジック
- ✅ 画面キャプチャ＋OCR実装（Phase 7で検討）
- ✅ コーディング問題の解答フォーマット

---

### 4. KanpeAI（カンペAI）

**公式サイト**: [https://kanpe.ai/](https://kanpe.ai/)

**概要**:
多言語対応のオンライン面接支援サービス。面接後の分析レポート機能が特徴。

**主要機能**:
- 音声認識＋AI回答生成
- 複数言語対応（日本語、英語、中国語等）
- 面接後の自動分析レポート
- 改善点のフィードバック

**技術仕様**:
- 多言語音声認識エンジン
- LLMによる回答品質評価
- データ分析・可視化

**本プロジェクトでの参考ポイント**:
- ✅ 面接後の分析・レポート機能（Phase 7で検討）
- ✅ 多言語対応の設計
- ✅ フィードバック生成ロジック

---

## オープンソースプロジェクト

実際のコード実装で参考にしているGitHubプロジェクト。

### 1. Interview-Assistant

**GitHub**: [https://github.com/nohairblingbling/Interview-Assistant](https://github.com/nohairblingbling/Interview-Assistant)

**技術スタック**:
- Electron（デスクトップアプリ）
- TypeScript（98.9%）
- React + Webpack
- Tailwind CSS + DaisyUI
- Deepgram SDK（音声認識）
- OpenAI（GPT models）

**主要機能**:
- リアルタイム音声認識（Deepgram）
- AI回答生成（OpenAI）
- PDF/画像処理（pdf-parse, Sharp）
- Redux Toolkit（状態管理）

**Windows対応**: ✅（electron-forge/maker-squirrel）

**本プロジェクトでの参考ポイント**:
- ✅ **最も参考にしているプロジェクト**
- ✅ Electron + TypeScript構成
- ✅ 透明オーバーレイ実装
- ✅ Deepgram統合方法
- ✅ electron-storeでの設定保存

---

### 2. AI-powererd-interview-Assistant

**GitHub**: [https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant](https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant)

**技術スタック**:
- Next.js 14（React）
- TypeScript/JavaScript
- Tailwind CSS
- Deepgram SDK（~100ms遅延）
- Groq SDK（Llama 3）、OpenAI、Anthropic Claude、Google Gemini
- LangChain（RAG）
- Pinecone（Vector DB）
- Tavily（Web検索）

**主要機能**:
- リアルタイム音声認識
- 複数LLM対応
- RAG実装（Pinecone + LangChain）
- PDF処理（pdf-parse, pdf2pic）
- NextAuth（認証）

**本プロジェクトでの参考ポイント**:
- ✅ RAG実装（Pinecone + LangChain）
- ✅ 複数LLM対応の設計
- ✅ Web検索統合（Tavily）
- ✅ PDF処理ロジック

---

### 3. interviewcopilot

**GitHub**: [https://github.com/hariiprasad/interviewcopilot](https://github.com/hariiprasad/interviewcopilot)

**技術スタック**:
- Next.js
- React with Redux
- Material-UI
- Azure Cognitive Services（Speech-to-Text）
- OpenAI（GPT）、Google Gemini（2.5 Pro/Flash）

**主要機能**:
- Azure Speech SDK統合
- 複数LLM（OpenAI/Gemini）
- React Markdown
- Docker対応

**本プロジェクトでの参考ポイント**:
- ✅ Azure Speech SDK統合方法
- ✅ UI設計（Material-UI）
- ✅ Dockerコンテナ化

---

### 4. Ai-Interview-Assistant-Python

**GitHub**: [https://github.com/pixelpump/Ai-Interview-Assistant-Python](https://github.com/pixelpump/Ai-Interview-Assistant-Python)

**技術スタック**:
- Python 3.7+
- Eel（Python/JavaScript統合）
- SpeechRecognition（Google Speech Recognition API）
- OpenAI GPT-3.5-turbo
- OpenAI TTS API

**主要機能**:
- システム音声キャプチャ
- 音声認識＋TTS
- デスクトップアプリ化（Eel）

**本プロジェクトでの参考ポイント**:
- ✅ システム音声キャプチャロジック
- ✅ Python実装の参考
- ✅ TTS機能実装（Phase 7で検討）

---

### 5. ai-interview-assistant

**GitHub**: [https://github.com/Guna1610/ai-interview-assistant](https://github.com/Guna1610/ai-interview-assistant)

**技術スタック**:
- フロントエンド: React + Vite、Ant Design
- バックエンド: Express.js（Node.js）
- Google Gemini API
- PDF/DOCX解析（pdf-parse, mammoth）

**主要機能**:
- 履歴書パーシング
- 質問生成、リアルタイム回答
- 自動フィードバック
- セッション管理（JSON）

**本プロジェクトでの参考ポイント**:
- ✅ 履歴書パーシング実装
- ✅ PDF/DOCX解析（pdf-parse, mammoth）
- ✅ セッション管理
- ✅ Ant Designでのフォーム設計

---

### 6. llm-interview-assistant

**GitHub**: [https://github.com/dmytrovoytko/llm-interview-assistant](https://github.com/dmytrovoytko/llm-interview-assistant)

**技術スタック**:
- Python 3.11/3.12
- Streamlit（Web UI）
- Elasticsearch（ハイブリッド検索）
- PostgreSQL（データベース）
- Ollama（ローカルLLM）、OpenAI
- Sentence Transformers（埋め込み）

**主要機能**:
- RAG（Elasticsearch + PostgreSQL）
- ローカルLLM（Ollama）
- Grafanaダッシュボード
- Docker + docker-compose

**本プロジェクトでの参考ポイント**:
- ✅ RAG設計（Elasticsearch）
- ✅ ローカルLLM実装
- ✅ PostgreSQLでの履歴管理
- ✅ モニタリング（Grafana）

---

## 技術的な参考ポイント

### 音声認識サービスの選択

| サービス | 使用プロジェクト | 特徴 |
|---------|---------------|------|
| **Deepgram** | Cluely, Interview-Assistant, AI-powererd | 100-300ms遅延、WebSocket対応 |
| **Azure Speech** | interviewcopilot | Microsoft統合、多言語対応 |
| **Google Speech** | Ai-Interview-Assistant-Python | 標準的、無料枠あり |
| **Whisper** | CueMe | 高精度、ローカル実行可能 |

→ **本プロジェクトの選択**: Deepgram（理由: 最速、実績あり）

---

### LLMサービスの選択

| LLM | 使用プロジェクト | 特徴 |
|-----|---------------|------|
| **OpenAI GPT-4** | ほぼ全プロジェクト | 最高品質、ストリーミング対応 |
| **Claude** | AI-powererd | 長文処理に強み |
| **Gemini** | interviewcopilot, ai-interview-assistant | 無料枠あり |
| **Llama 3（Groq）** | AI-powererd | オープンソース、高速 |

→ **本プロジェクトの選択**: GPT-4 Turbo（Phase 7で複数LLM対応）

---

### RAG実装方式

| 方式 | 使用プロジェクト | 技術 |
|-----|---------------|------|
| **Pinecone + LangChain** | AI-powererd | クラウドベクトルDB、高機能 |
| **Elasticsearch** | llm-interview-assistant | ハイブリッド検索、スケーラブル |
| **Chroma（ローカル）** | - | ローカル実行、無料 |

→ **本プロジェクトの選択**: Chroma（理由: ローカル、無料、LangChain統合）

---

### UI/UXデザイン

| 要素 | 参考元 | 採用内容 |
|-----|--------|---------|
| **ホットキー** | CueMe（Command+T） | Ctrl+Shift+A |
| **透明オーバーレイ** | Cluely, CueMe | 背景blur + 透明度85% |
| **UIライブラリ** | Interview-Assistant（DaisyUI） | Tailwind CSS + DaisyUI |
| **カラーテーマ** | 各種サービス | ダークテーマ（目立たない） |

---

### セキュリティ対策

| 対策 | 参考元 | 実装内容 |
|-----|--------|---------|
| **コンプライアンス** | Cluely（SOC2/GDPR） | 免責事項明記、データ即時破棄 |
| **APIキー暗号化** | Interview-Assistant | electron-store + AES-256 |
| **プロセス分離** | Electron標準 | コンテキストブリッジ使用 |

---

## まとめ

### 商用サービスから学んだこと

- **Cluely**: セキュリティ・コンプライアンスの重要性
- **CueMe**: 日本市場向けのUI/UX設計
- **Interview Hunter**: 技術面接特化の価値
- **KanpeAI**: 面接後の分析機能の需要

### OSSプロジェクトから学んだこと

- **Interview-Assistant**: Electron実装のベストプラクティス
- **AI-powererd**: RAG実装の具体的な方法
- **interviewcopilot**: 複数LLM対応の設計
- **llm-interview-assistant**: ローカルLLMの活用法

### 本プロジェクトの差別化

| 要素 | 本プロジェクト | 他サービス/プロジェクト |
|-----|-------------|---------------------|
| **価格** | 完全無料（APIコストのみ） | 月額サブスクリプション |
| **プライバシー** | 完全ローカル処理 | クラウド送信あり |
| **カスタマイズ性** | オープンソース、改変自由 | クローズドソース |
| **対応OS** | Windows特化 | Mac/Web中心 |
| **日本語最適化** | 日本語UI/プロンプト | 英語ベース |

---

## 参考リンク

### 商用サービス
- Cluely: https://cluely.ai/
- CueMe: https://cueme.app/
- Interview Hunter: https://interviewhunter.com/
- KanpeAI: https://kanpe.ai/

### OSSプロジェクト
- Interview-Assistant: https://github.com/nohairblingbling/Interview-Assistant
- AI-powererd-interview-Assistant: https://github.com/Vijaysingh1621/AI-powererd-interview-Assistant
- interviewcopilot: https://github.com/hariiprasad/interviewcopilot
- Ai-Interview-Assistant-Python: https://github.com/pixelpump/Ai-Interview-Assistant-Python
- ai-interview-assistant: https://github.com/Guna1610/ai-interview-assistant
- llm-interview-assistant: https://github.com/dmytrovoytko/llm-interview-assistant

### 技術ドキュメント
- Deepgram API: https://developers.deepgram.com/
- OpenAI API: https://platform.openai.com/docs/
- Electron Documentation: https://www.electronjs.org/docs
- LangChain Documentation: https://js.langchain.com/docs/

---

**最終更新**: 2026-02-01
