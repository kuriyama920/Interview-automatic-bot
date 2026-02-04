# システムアーキテクチャ設計書

Interview Automatic Botの技術アーキテクチャとシステム設計の詳細を記載します。

---

## 目次

1. [システム全体図](#システム全体図)
2. [技術スタック詳細](#技術スタック詳細)
3. [データフロー](#データフロー)
4. [コンポーネント設計](#コンポーネント設計)
5. [API統合](#api統合)
6. [セキュリティ設計](#セキュリティ設計)
7. [パフォーマンス最適化](#パフォーマンス最適化)
8. [エラーハンドリング](#エラーハンドリング)

---

## システム全体図

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザー環境                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               オンライン面接ツール                          │   │
│  │          (Zoom / Teams / Google Meet)                   │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────┐            │   │
│  │  │    面接官の質問音声                        │            │   │
│  │  └────────────┬─────────────────────────────┘            │   │
│  └───────────────┼──────────────────────────────────────────┘   │
│                  │ システムオーディオキャプチャ                     │
│                  ▼                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Interview Automatic Bot (Electron)              │   │
│  │                                                          │   │
│  │  ┌────────────────┐    ┌────────────────┐               │   │
│  │  │ Main Process   │◄──►│ Renderer       │               │   │
│  │  │                │IPC │ Process (React)│               │   │
│  │  │ ・音声キャプチャ │    │ ・UI表示        │               │   │
│  │  │ ・透明ウィンドウ │    │ ・状態管理      │               │   │
│  │  │ ・ホットキー    │    │ ・ユーザー操作   │               │   │
│  │  └────┬───────────┘    └────────┬───────┘               │   │
│  │       │                         │                       │   │
│  │       │  ┌──────────────────────┴────────┐              │   │
│  │       │  │      Services Layer           │              │   │
│  │       │  │  ・STT Service (Deepgram)     │              │   │
│  │       │  │  ・LLM Service (OpenAI)       │              │   │
│  │       │  │  ・RAG Service (LangChain)    │              │   │
│  │       │  │  ・Storage Service            │              │   │
│  │       │  └───────────┬───────────────────┘              │   │
│  │       │              │                                  │   │
│  │  ┌────▼──────────────▼────────┐                         │   │
│  │  │   Local Storage            │                         │   │
│  │  │  ・electron-store (設定)    │                         │   │
│  │  │  ・Chroma (ベクトルDB)      │                         │   │
│  │  │  ・Winston (ログ)           │                         │   │
│  │  └────────────────────────────┘                         │   │
│  └──────────────┬───────────────────────────────────────────┘   │
│                 │ HTTPS/WebSocket                              │
└─────────────────┼──────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                      外部APIサービス                              │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │  Deepgram API   │  │   OpenAI API    │  │  Chroma DB   │   │
│  │                 │  │                 │  │  (Optional)  │   │
│  │ ・音声認識       │  │ ・GPT-4 Turbo   │  │ ・クラウド    │   │
│  │ ・WebSocket接続 │  │ ・ストリーミング │  │   ベクトル検索 │   │
│  │ ・100ms遅延     │  │ ・Embeddings    │  │              │   │
│  └─────────────────┘  └─────────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 技術スタック詳細

### フロントエンド（Renderer Process）

| 技術 | バージョン | 用途 |
|------|----------|------|
| **React** | 18.2.0 | UIフレームワーク |
| **TypeScript** | 5.3.0 | 型安全な開発 |
| **Redux Toolkit** | 2.0.0 | グローバル状態管理 |
| **Tailwind CSS** | 3.4.0 | ユーティリティファーストCSS |
| **DaisyUI** | 4.6.0 | UIコンポーネントライブラリ |
| **React Markdown** | 9.0.0 | マークダウンレンダリング |

### バックエンド（Main Process）

| 技術 | バージョン | 用途 |
|------|----------|------|
| **Electron** | 28.2.0 | デスクトップアプリフレームワーク |
| **Node.js** | 18.x LTS | ランタイム |
| **TypeScript** | 5.3.0 | 型安全な開発 |

### サービス層

| サービス | ライブラリ | 用途 |
|---------|-----------|------|
| **音声認識** | @deepgram/sdk 3.4.0 | リアルタイムSTT |
| **LLM** | openai 4.28.0 | AI回答生成 |
| **RAG** | langchain 0.1.0 | 文書検索・埋め込み |
| **ベクトルDB** | chromadb-client 1.5.0 | ローカルベクトル検索 |
| **PDF解析** | pdf-parse 1.1.1 | 履歴書テキスト抽出 |
| **DOCX解析** | mammoth 1.6.0 | Word文書解析 |
| **ストレージ** | electron-store 8.1.0 | 設定保存（暗号化） |
| **ログ** | winston 3.11.0 | 構造化ログ出力 |

### 開発ツール

| ツール | 用途 |
|--------|------|
| **Electron Vite** | 高速ビルド・HMR |
| **ESLint** | コード品質チェック |
| **Prettier** | コードフォーマット |
| **Vitest** | 単体テスト |
| **Playwright** | E2Eテスト |
| **electron-builder** | Windows .exe生成 |

---

## データフロー

### 1. 音声認識フロー

```
┌──────────────┐
│ System Audio │ Zoom/Teamsの音声
└──────┬───────┘
       │ ①キャプチャ
       ▼
┌──────────────────┐
│ desktopCapturer  │ Electron API
└──────┬───────────┘
       │ ②MediaStream
       ▼
┌──────────────────┐
│ AudioCapture     │ src/main/audio/capture.ts
└──────┬───────────┘
       │ ③ArrayBuffer (chunk: 0.5s)
       ▼
┌──────────────────┐
│ STTService       │ src/services/stt.service.ts
└──────┬───────────┘
       │ ④WebSocket送信
       ▼
┌──────────────────┐
│ Deepgram API     │ 外部サービス
└──────┬───────────┘
       │ ⑤JSON応答 (100-300ms)
       ▼
┌──────────────────┐
│ IPC Send         │ Main → Renderer
│ 'transcript'     │
└──────┬───────────┘
       │ ⑥Event
       ▼
┌──────────────────┐
│ Redux Dispatch   │ addTranscript()
└──────┬───────────┘
       │ ⑦State更新
       ▼
┌──────────────────┐
│ React Component  │ TranscriptionView
└──────────────────┘
       │ ⑧UI更新
       ▼
   [ユーザーに表示]
```

### 2. AI回答生成フロー

```
┌──────────────────┐
│ Transcript State │ Redux Store
└──────┬───────────┘
       │ ①最新の文字起こし
       ▼
┌──────────────────┐
│ QuestionDetector │ src/services/question-detector.ts
└──────┬───────────┘
       │ ②質問判定（正規表現）
       ▼
  [質問検出] ─Yes→ ┌──────────────────┐
       │           │ RAGService       │ (オプション)
       No          └──────┬───────────┘
       │                  │ ③コンテキスト検索
       ▼                  ▼
   [スキップ]      ┌──────────────────┐
                   │ LLMService       │ src/services/llm.service.ts
                   └──────┬───────────┘
                          │ ④GPT-4 API呼び出し
                          ▼
                   ┌──────────────────┐
                   │ OpenAI API       │ ストリーミング応答
                   └──────┬───────────┘
                          │ ⑤トークンごとに返信
                          ▼
                   ┌──────────────────┐
                   │ IPC Send         │ 'answer-chunk'
                   │ (streaming)      │
                   └──────┬───────────┘
                          │ ⑥イベント連続送信
                          ▼
                   ┌──────────────────┐
                   │ React State      │ useState hook
                   └──────┬───────────┘
                          │ ⑦文字列連結
                          ▼
                   ┌──────────────────┐
                   │ AnswerView       │ Component
                   └──────────────────┘
                          │ ⑧リアルタイム表示
                          ▼
                      [ユーザーに表示]
```

### 3. RAGフロー（履歴書ベース回答）

```
┌──────────────────┐
│ 履歴書PDF/DOCX    │ ユーザーアップロード
└──────┬───────────┘
       │ ①ファイル選択
       ▼
┌──────────────────┐
│ pdf-parse /      │ テキスト抽出
│ mammoth          │
└──────┬───────────┘
       │ ②プレーンテキスト
       ▼
┌──────────────────┐
│ Text Splitter    │ LangChain
│ (chunk: 500)     │
└──────┬───────────┘
       │ ③ドキュメント分割
       ▼
┌──────────────────┐
│ OpenAI           │ text-embedding-3-small
│ Embeddings       │
└──────┬───────────┘
       │ ④ベクトル生成（1536次元）
       ▼
┌──────────────────┐
│ Chroma           │ ローカルベクトルDB
│ VectorStore      │ ~/.interview-bot/chroma/
└──────┬───────────┘
       │ ⑤保存完了
       ▼
  [インデックス化完了]

─────── 質問時 ───────

┌──────────────────┐
│ 質問テキスト      │ "あなたの強みは？"
└──────┬───────────┘
       │ ①クエリ
       ▼
┌──────────────────┐
│ Chroma           │ similaritySearch(query, k=3)
│ .similaritySearch│
└──────┬───────────┘
       │ ②関連ドキュメント3件
       ▼
┌──────────────────┐
│ Context Builder  │ "経歴: ...、スキル: ..."
└──────┬───────────┘
       │ ③コンテキスト文字列
       ▼
┌──────────────────┐
│ LLM Prompt       │ System + Context + Question
└──────┬───────────┘
       │ ④プロンプト送信
       ▼
┌──────────────────┐
│ GPT-4 API        │ コンテキストを考慮した回答
└──────────────────┘
```

---

## コンポーネント設計

### Electronプロセス構成

```
Main Process (Node.js)
├── index.ts              エントリーポイント
├── window.ts             ウィンドウ管理
│   ├── createWindow()    透明オーバーレイ作成
│   ├── toggle()          表示/非表示切替
│   └── registerHotkey()  Ctrl+Shift+A登録
├── ipc.ts                IPC通信ハンドラ
│   ├── handle('start-recording')
│   ├── handle('stop-recording')
│   └── send('transcript')
└── audio/
    ├── capture.ts        システム音声キャプチャ
    └── stream.ts         オーディオストリーム管理

Preload Script
└── index.ts              コンテキストブリッジ
    └── exposeInMainWorld('electron', {...})

Renderer Process (React)
└── src/
    ├── App.tsx           ルートコンポーネント
    ├── components/       UIコンポーネント
    ├── hooks/            カスタムフック
    └── store/            Redux Store
```

### React コンポーネント階層

```
App
├── Header
│   ├── Logo
│   └── ActionButtons
│       ├── SettingsButton
│       └── HistoryButton
├── MainContent
│   ├── TranscriptionView
│   │   └── TranscriptItem[]
│   └── AnswerView
│       ├── LoadingIndicator
│       ├── MarkdownRenderer
│       └── CopyButton
├── SettingsPanel (Modal)
│   ├── APIKeyInput (Deepgram)
│   ├── APIKeyInput (OpenAI)
│   ├── ModelSelector
│   └── HotkeyConfig
└── Footer
    └── StatusBar
```

---

## API統合

### Deepgram API

**エンドポイント**: `wss://api.deepgram.com/v1/listen`

**認証**: APIキーをAuthorizationヘッダーで送信

**パラメータ**:
```typescript
{
  model: 'nova-2',           // 最新モデル
  language: 'ja',            // 日本語
  smart_format: true,        // 句読点自動挿入
  interim_results: true,     // 途中結果も返す
  utterance_end_ms: 1000,    // 発話終了判定（1秒）
  vad_events: true,          // 音声検出イベント
}
```

**応答形式**:
```json
{
  "channel": {
    "alternatives": [
      {
        "transcript": "あなたの強みは何ですか",
        "confidence": 0.98
      }
    ]
  },
  "is_final": true,
  "speech_final": true
}
```

**レート制限**: 同時接続10まで（無料枠）

**コスト**: $0.0043/分

---

### OpenAI API

**エンドポイント**: `https://api.openai.com/v1/chat/completions`

**認証**: Bearer Token

**ストリーミングリクエスト**:
```typescript
{
  model: 'gpt-4-turbo-preview',
  messages: [
    {
      role: 'system',
      content: 'あなたは面接の回答アシスタントです...'
    },
    {
      role: 'user',
      content: 'あなたの強みは何ですか？'
    }
  ],
  temperature: 0.7,
  max_tokens: 500,
  stream: true  // ストリーミング有効
}
```

**ストリーミング応答**:
```
data: {"choices":[{"delta":{"content":"私"}}]}

data: {"choices":[{"delta":{"content":"の"}}]}

data: {"choices":[{"delta":{"content":"強み"}}]}

data: [DONE]
```

**レート制限**:
- GPT-4: 10,000 TPM (Tokens Per Minute)
- GPT-3.5: 60,000 TPM

**コスト**:
- GPT-4 Turbo: $0.01/1k tokens (入力), $0.03/1k tokens (出力)
- Embeddings: $0.0001/1k tokens

---

## セキュリティ設計

### 1. APIキー保護

```typescript
// electron-storeで暗号化保存
import Store from 'electron-store';

const store = new Store({
  encryptionKey: 'your-secret-encryption-key',  // 実際は環境変数から取得
  name: 'config',
});

// 保存
store.set('apiKeys.deepgram', apiKey);

// 取得
const apiKey = store.get('apiKeys.deepgram');
```

**対策**:
- APIキーはレンダラープロセスに渡さない
- メインプロセスでのみ管理
- electron-storeのAES-256暗号化使用
- `.env`ファイルは`.gitignore`に追加

### 2. プロセス分離

```typescript
// preload.ts - コンテキストブリッジ
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  // 許可する操作のみ公開
  startRecording: () => ipcRenderer.invoke('start-recording'),
  stopRecording: () => ipcRenderer.invoke('stop-recording'),
  onTranscript: (callback) => ipcRenderer.on('transcript', callback),
  // APIキー操作は公開しない
});
```

### 3. 通信セキュリティ

- すべての外部API通信はHTTPS/WSS
- 証明書検証有効
- タイムアウト設定（30秒）

### 4. データ保護

```typescript
// 会話履歴は暗号化保存
const history = store.get('conversations', []);
history.push({
  timestamp: Date.now(),
  transcript: encryptData(transcriptText),  // 暗号化
  answer: encryptData(answerText),
});
store.set('conversations', history);
```

---

## パフォーマンス最適化

### 1. 音声ストリーミング最適化

```typescript
// チャンクサイズ: 0.5秒 = 8000 samples (16kHz)
const CHUNK_SIZE = 8000;
const SAMPLE_RATE = 16000;

// バッファリング
const audioBuffer = new Float32Array(CHUNK_SIZE);
let bufferIndex = 0;

audioContext.audioWorklet.addModule('audio-processor.js');
const processor = new AudioWorkletNode(audioContext, 'audio-processor');

processor.port.onmessage = (event) => {
  const samples = event.data;

  // Deepgramに送信
  if (samples.length === CHUNK_SIZE) {
    deepgramConnection.send(samples);
  }
};
```

### 2. React レンダリング最適化

```typescript
// メモ化でレンダリング抑制
export const TranscriptItem = React.memo(({ item }) => {
  return (
    <div className="transcript-item">
      {item.text}
    </div>
  );
}, (prevProps, nextProps) => {
  // isFinalがtrueになった時のみ再レンダリング
  return prevProps.item.isFinal === nextProps.item.isFinal;
});
```

### 3. Redux状態管理最適化

```typescript
// Reduxスライス - 正規化されたデータ構造
interface TranscriptState {
  ids: string[];
  entities: Record<string, TranscriptItem>;
  currentSpeech: string;  // 発話中の途中結果
}

// セレクターでメモ化
export const selectAllTranscripts = createSelector(
  (state: RootState) => state.transcript.ids,
  (state: RootState) => state.transcript.entities,
  (ids, entities) => ids.map(id => entities[id])
);
```

### 4. LLMストリーミング最適化

```typescript
// バックプレッシャー制御
const MAX_BUFFER_SIZE = 100;
let answerBuffer: string[] = [];

for await (const chunk of stream) {
  answerBuffer.push(chunk.content);

  // 10トークンごとに送信
  if (answerBuffer.length >= 10) {
    mainWindow.webContents.send('answer-chunk', answerBuffer.join(''));
    answerBuffer = [];
  }
}
```

---

## エラーハンドリング

### 1. 階層的エラーハンドリング

```typescript
// カスタムエラークラス
export class STTError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'STTError';
  }
}

export class LLMError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'LLMError';
  }
}

// エラーハンドラー
export class ErrorHandler {
  static handle(error: Error) {
    logger.error('Error occurred', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });

    // ユーザーに通知
    if (error instanceof STTError) {
      dialog.showErrorBox('音声認識エラー', error.message);
    } else if (error instanceof LLMError) {
      dialog.showErrorBox('AI応答エラー', error.message);
    } else {
      dialog.showErrorBox('エラー', '予期しないエラーが発生しました');
    }
  }
}
```

### 2. リトライロジック

```typescript
// 指数バックオフでリトライ
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;

      const delay = baseDelay * Math.pow(2, i);
      logger.warn(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries reached');
}

// 使用例
const transcript = await retryWithBackoff(() =>
  deepgramService.transcribe(audioChunk)
);
```

### 3. グレースフルシャットダウン

```typescript
// アプリ終了時のクリーンアップ
app.on('before-quit', async (event) => {
  event.preventDefault();

  try {
    // WebSocket接続クローズ
    await deepgramService.disconnect();

    // 保存待ちデータをフラッシュ
    await storageService.flush();

    // ログ出力完了待ち
    await logger.end();

    app.exit(0);
  } catch (error) {
    logger.error('Shutdown error', error);
    app.exit(1);
  }
});
```

---

## 拡張性設計

### プラグインシステム（将来）

```typescript
// プラグインインターフェース
interface Plugin {
  name: string;
  version: string;
  initialize(): Promise<void>;
  onTranscript(text: string): Promise<void>;
  onAnswer(answer: string): Promise<void>;
}

// 使用例: 翻訳プラグイン
class TranslationPlugin implements Plugin {
  name = 'translation';
  version = '1.0.0';

  async initialize() {
    // DeepL API初期化
  }

  async onTranscript(text: string) {
    const translated = await this.translate(text, 'en');
    // 翻訳結果を表示
  }
}
```

---

## まとめ

このアーキテクチャは以下を実現します：

✅ **低遅延**: 音声認識100-300ms、LLM応答2秒以内
✅ **高セキュリティ**: APIキー暗号化、プロセス分離
✅ **スケーラブル**: プラグインシステム、モジュラー設計
✅ **保守性**: TypeScript、テスト、ログ
✅ **ユーザビリティ**: ストリーミングUI、エラーハンドリング

次のステップ: [DEVELOPMENT.md](./DEVELOPMENT.md)を参照して実装開始
