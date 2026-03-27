# AI想定質問自動生成 設計書

## 概要

履歴書・プロフィール情報をもとに、面接の想定質問と模範回答を最大20件AI自動生成する機能。生成された質問・回答は`expected_qa`として保存され、面接中のAI回答提案のRAGコンテキストとしても活用される。

## 機能一覧

### 機能A: AI一括生成
- 「AI自動生成」ボタンで20件の質問+模範回答をSSEストリーミング生成
- 1問ずつリアルタイム表示
- 再生成可能（既存質問の上書き確認ダイアログ）

### 機能B: 回答AI補完
- 手動入力した質問に対して「AI回答生成」ボタンで模範回答を生成
- SSEストリーミングで回答欄にリアルタイム表示

## APIエンドポイント

### POST /api/questions/generate
- 認証: JWT必須
- レスポンス: SSE (text/event-stream)
- 使用量: ai_tokens消費
- 処理:
  1. プロフィール取得（profiles テーブル）
  2. 履歴書チャンク全取得（documents type='resume' → document_chunks）
  3. 質問生成プロンプト構築
  4. gpt-5.4-nano でSSEストリーミング生成
  5. 1問完成ごとにSSEイベント送信
- SSEイベント:
  - `question`: `{index, question, answer}` — 1問ずつ
  - `done`: `{total, usage}` — 完了
  - `error`: `{message}` — エラー

### POST /api/questions/answer
- 認証: JWT必須
- リクエスト: `{question: string}`
- レスポンス: SSE (text/event-stream)
- 使用量: ai_tokens消費
- 処理:
  1. プロフィール取得
  2. 履歴書コンテキスト取得
  3. 回答生成プロンプト構築
  4. gpt-5.4-nano でSSEストリーミング
- SSEイベント:
  - `chunk`: テキストデルタ
  - `done`: 完了

## プロンプト設計

### 質問生成プロンプト
```
あなたは面接対策の専門家です。
以下の候補者情報と履歴書をもとに、面接で聞かれそうな想定質問を20件生成してください。

【候補者プロフィール】
{profileContext}

【履歴書】
{resumeContext}

【出力形式】
各質問を以下のJSON形式で、1問ずつ出力してください：
<question>{"question": "質問文", "answer": "模範回答（1-2分で話せる長さ、200-400文字）"}</question>

【質問カテゴリの分散】
以下のカテゴリから均等に出題：
1. 自己紹介・経歴（3問）
2. 志望動機・キャリアビジョン（3問）
3. 技術力・専門知識（4問）
4. 行動面接（STAR形式）（4問）
5. 課題・弱点・改善（3問）
6. カルチャーフィット・チームワーク（3問）

【回答の要件】
- 候補者の実際の経歴・スキルに基づく具体的な回答
- 数字・固有名詞を含める
- STAR形式（状況→課題→行動→結果）を適宜使用
- 話し言葉（です・ます調）
```

### 回答補完プロンプト
```
あなたは面接対策の専門家です。
以下の質問に対する模範回答を生成してください。

【候補者プロフィール】
{profileContext}

【履歴書】
{resumeContext}

【質問】
{question}

【回答の要件】
- 1-2分で話せる長さ（200-400文字）
- 候補者の実際の経歴に基づく具体的な回答
- STAR形式を適宜使用
- 話し言葉（です・ます調）
```

## フロントエンドUI

### QuestionsPage.tsx 変更
- ヘッダーに「AI自動生成」ボタン追加（SparklesIcon + ラベル）
  - 履歴書未アップロード時は disabled + ツールチップ「履歴書をアップロードしてください」
- 生成中: プログレスバー「3 / 20 生成中...」+ キャンセルボタン
- 既存質問ありの場合: 確認ダイアログ「既存の質問を上書きしますか？」
- 各質問カードの回答欄横に「AI回答生成」ミニボタン（SparklesIcon）
- 回答生成中: 回答テキストエリアにストリーミング表示 + スピナー

### InterviewQuestionsPanel.tsx 変更
- サイドバーパネルにも「AI生成」ボタン追加（小さめ）

## データフロー（面接時の活用）

```
AI生成 → POST /api/questions (is_auto_generated: true)
  → interview_questions テーブル保存
  → 仮想ドキュメント expected_qa 作成/更新
  → document_chunks にEmbedding保存
  → 面接中の POST /api/ai/generate-v2 で RAGコンテキストとして取得
  → AI回答提案に質問・回答が反映
```

## サービス層・IPC

### questions.service.ts 追加メソッド
- `generateQuestions()`: SSEストリーム → EventSource風の処理
- `generateAnswer(question: string)`: SSEストリーム → テキスト返却

### IPC追加ハンドラー
- `questions:generate`: 一括生成（SSEプロキシ）
- `questions:generateAnswer`: 回答補完（SSEプロキシ）

## フック変更

### useInterviewQuestions.ts 追加
- `generateQuestions()`: AI一括生成 → 状態更新
- `generateAnswer(index: number)`: 単一回答補完
- `isGenerating: boolean`: 生成中フラグ
- `generationProgress: {current: number, total: number}`: 進捗
- `cancelGeneration()`: 生成キャンセル

## 使用量・制限

- 一括生成: ai_tokens を予約 → 実消費で調整（既存パターン流用）
- 回答補完: 同上
- Free/Pro/Maxプラン制限に従う
- 履歴書が未アップロードの場合はエラー返却

## エラーハンドリング

- 履歴書未アップロード: フロントエンドでボタン無効化 + バックエンドで400エラー
- 使用量超過: 既存の使用量チェックで429エラー
- AI生成失敗: SSE errorイベント → ユーザーに通知
- 部分生成（途中切断）: 生成済み分は保持、ユーザーに通知

## テスト計画

### ユニットテスト
- プロンプト構築のテスト
- SSEパース処理のテスト
- バリデーションのテスト
- 使用量チェックのテスト

### 統合テスト
- /api/questions/generate エンドポイント
- /api/questions/answer エンドポイント
- 既存の /api/questions CRUD との整合性

### フロントエンドテスト
- ボタン表示/非表示ロジック
- 生成中UI状態
- 確認ダイアログ
