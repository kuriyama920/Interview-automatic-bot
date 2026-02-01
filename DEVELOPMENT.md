# 開発ガイド - Interview Automatic Bot

このドキュメントでは、プロジェクトの詳細な開発ワークフローを説明します。

---

## 📋 目次

1. [開発環境構築](#開発環境構築)
2. [Phase 0: プロジェクト初期化](#phase-0-プロジェクト初期化)
3. [Phase 1: 音声認識実装](#phase-1-音声認識実装)
4. [Phase 2: LLM統合](#phase-2-llm統合)
5. [Phase 3: ステルスUI実装](#phase-3-ステルスui実装)
6. [Phase 4: RAG実装](#phase-4-rag実装)
7. [Phase 5: 設定・保存機能](#phase-5-設定保存機能)
8. [Phase 6: ビルド・配布](#phase-6-ビルド配布)
9. [テスト戦略](#テスト戦略)
10. [デバッグ手法](#デバッグ手法)

---

## 開発環境構築

### 必須ツール

```bash
# Node.js (v18.x LTS)
node --version  # v18.19.0 以上

# npm または pnpm
npm --version   # 10.x 以上
# または
pnpm --version  # 8.x 以上

# Git
git --version   # 2.x 以上
```

### 推奨IDE・拡張機能

**Visual Studio Code** + 以下の拡張機能:

- ESLint
- Prettier
- TypeScript Vue Plugin (Volar)
- Tailwind CSS IntelliSense
- Error Lens
- GitLens

### APIキー取得

#### 1. Deepgram API

1. [Deepgram Console](https://console.deepgram.com/)にアクセス
2. アカウント作成（GitHub連携可能）
3. 無料クレジット$200を取得
4. API Keysページでキー発行

**料金**: $0.0043/分（無料枠で約46,000分）

#### 2. OpenAI API

1. [OpenAI Platform](https://platform.openai.com/)にアクセス
2. アカウント作成
3. Billingで支払い方法登録（$5最低チャージ）
4. API Keysページでキー発行

**料金（GPT-4 Turbo）**:
- 入力: $0.01/1k tokens
- 出力: $0.03/1k tokens

---

## Phase 0: プロジェクト初期化

**期間**: 1-2日
**目標**: 開発環境完成、空のElectronアプリ起動

### タスクリスト

- [ ] リポジトリ初期化
- [ ] Electron Viteプロジェクト作成
- [ ] TypeScript設定
- [ ] ESLint + Prettier設定
- [ ] フォルダ構成作成
- [ ] 基本的なウィンドウ表示確認

### 実装手順

#### 1. プロジェクト作成

```bash
# Electron Vite公式テンプレート使用
npm create @quick-start/electron@latest interview-automatic-bot

# 選択肢
✔ Project name: interview-automatic-bot
✔ Select a framework: react
✔ Add TypeScript? Yes
✔ Add Electron updater plugin? No
✔ Enable Electron download mirror proxy? No

cd interview-automatic-bot
```

#### 2. 依存関係追加

```bash
# 主要ライブラリインストール
pnpm add @deepgram/sdk openai electron-store ws
pnpm add @reduxjs/toolkit react-redux
pnpm add tailwindcss daisyui postcss autoprefixer
pnpm add langchain pdf-parse mammoth
pnpm add winston

# 開発依存
pnpm add -D @types/ws @types/pdf-parse
pnpm add -D eslint prettier eslint-config-prettier
pnpm add -D electron-builder
```

#### 3. Tailwind CSS設定

```bash
npx tailwindcss init -p
```

`tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/renderer/index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
}
```

`src/renderer/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

#### 4. 環境変数設定

`.env.example`:
```env
# Deepgram API
DEEPGRAM_API_KEY=your_deepgram_api_key

# OpenAI API
OPENAI_API_KEY=your_openai_api_key

# オプション
ANTHROPIC_API_KEY=your_anthropic_api_key
LOG_LEVEL=info
```

#### 5. 起動確認

```bash
pnpm dev
```

→ 空のElectronウィンドウが表示されればOK ✅

---

## Phase 1: 音声認識実装

**期間**: 3-4日
**目標**: マイク音声 → Deepgram → リアルタイム文字起こし表示

### タスクリスト

- [ ] システム音声キャプチャ実装（メインプロセス）
- [ ] Deepgram WebSocket接続
- [ ] リアルタイム文字起こし表示UI
- [ ] 発話終了検出
- [ ] エラーハンドリング

### 1.1 システム音声キャプチャ

`src/main/audio/capture.ts`:
```typescript
import { desktopCapturer } from 'electron';

export class AudioCapture {
  private mediaStream: MediaStream | null = null;

  async startCapture(): Promise<MediaStream> {
    // システム音声ソース取得
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 }
    });

    // 制約設定
    const constraints: MediaStreamConstraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id
        }
      } as any,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id,
          maxWidth: 1920,
          maxHeight: 1080
        }
      } as any
    };

    // メディアストリーム取得
    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    return this.mediaStream;
  }

  stopCapture(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }
}
```

### 1.2 Deepgram統合サービス

`src/services/stt.service.ts`:
```typescript
import { createClient, LiveTranscriptionEvents, LiveClient } from '@deepgram/sdk';
import { EventEmitter } from 'events';

export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export class STTService extends EventEmitter {
  private deepgram;
  private connection: LiveClient | null = null;

  constructor(apiKey: string) {
    super();
    this.deepgram = createClient(apiKey);
  }

  async startLiveTranscription(language: 'ja' | 'en' = 'ja') {
    this.connection = this.deepgram.listen.live({
      model: 'nova-2',
      language,
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
    });

    // イベントリスナー設定
    this.connection.on(LiveTranscriptionEvents.Open, () => {
      console.log('Deepgram connection opened');
      this.emit('ready');
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const transcript = data.channel.alternatives[0].transcript;
      const isFinal = data.is_final;

      if (transcript && transcript.length > 0) {
        const result: TranscriptResult = {
          text: transcript,
          isFinal,
          timestamp: Date.now(),
        };
        this.emit('transcript', result);
      }
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.emit('utteranceEnd');
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error('Deepgram error:', error);
      this.emit('error', error);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      console.log('Deepgram connection closed');
      this.emit('close');
    });

    return this.connection;
  }

  sendAudio(audioData: ArrayBuffer) {
    if (this.connection) {
      this.connection.send(audioData);
    }
  }

  stop() {
    if (this.connection) {
      this.connection.finish();
      this.connection = null;
    }
  }
}
```

### 1.3 UI実装（React）

`src/renderer/src/components/TranscriptionView.tsx`:
```typescript
import React, { useEffect, useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { addTranscript } from '../store/transcriptSlice';

interface Transcript {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
}

export const TranscriptionView: React.FC = () => {
  const transcripts = useAppSelector((state) => state.transcript.items);
  const dispatch = useAppDispatch();

  useEffect(() => {
    // IPCリスナー設定
    window.electron.ipcRenderer.on('transcript', (result) => {
      dispatch(addTranscript(result));
    });

    return () => {
      window.electron.ipcRenderer.removeAllListeners('transcript');
    };
  }, [dispatch]);

  return (
    <div className="h-full overflow-y-auto p-4 bg-base-200">
      <h2 className="text-lg font-bold mb-2">文字起こし</h2>
      <div className="space-y-2">
        {transcripts.map((item) => (
          <div
            key={item.id}
            className={`p-2 rounded ${
              item.isFinal ? 'bg-base-100' : 'bg-base-300 opacity-70'
            }`}
          >
            <p className="text-sm">{item.text}</p>
            <span className="text-xs opacity-50">
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 1.4 Redux状態管理

`src/renderer/src/store/transcriptSlice.ts`:
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface TranscriptItem {
  id: string;
  text: string;
  isFinal: boolean;
  timestamp: number;
}

interface TranscriptState {
  items: TranscriptItem[];
  isRecording: boolean;
}

const initialState: TranscriptState = {
  items: [],
  isRecording: false,
};

export const transcriptSlice = createSlice({
  name: 'transcript',
  initialState,
  reducers: {
    addTranscript: (state, action: PayloadAction<Omit<TranscriptItem, 'id'>>) => {
      const id = `${Date.now()}-${Math.random()}`;
      state.items.push({ id, ...action.payload });
    },
    clearTranscripts: (state) => {
      state.items = [];
    },
    setRecording: (state, action: PayloadAction<boolean>) => {
      state.isRecording = action.payload;
    },
  },
});

export const { addTranscript, clearTranscripts, setRecording } = transcriptSlice.actions;
export default transcriptSlice.reducer;
```

### 成果物確認

```bash
✅ マイク音声がリアルタイムでテキスト化
✅ 遅延<300ms
✅ 日本語認識精度90%以上
✅ 発話終了時に自動区切り
```

---

## Phase 2: LLM統合

**期間**: 3-4日
**目標**: 質問検出 → GPT-4で回答生成 → ストリーミング表示

### タスクリスト

- [ ] OpenAI API統合
- [ ] 質問検出ロジック実装
- [ ] ストリーミング回答生成
- [ ] 回答表示UI
- [ ] プロンプトエンジニアリング

### 2.1 質問検出ロジック

`src/services/question-detector.ts`:
```typescript
export class QuestionDetector {
  private questionPatterns = [
    /(?:どう|何|いつ|どこ|誰|なぜ|どのように).*[?？]/,
    /.*(?:ですか|ますか|ましたか)[?？]?$/,
    /.*について(?:教えて|話して|説明して)/,
    /.*経験.*ありますか/,
    /.*どう思いますか/,
  ];

  isQuestion(text: string): boolean {
    return this.questionPatterns.some(pattern => pattern.test(text));
  }

  extractQuestions(transcripts: string[]): string[] {
    return transcripts.filter(text => this.isQuestion(text));
  }
}
```

### 2.2 LLMサービス

`src/services/llm.service.ts`:
```typescript
import OpenAI from 'openai';
import { EventEmitter } from 'events';

export interface LLMConfig {
  model: 'gpt-4-turbo-preview' | 'gpt-3.5-turbo';
  temperature: number;
  maxTokens: number;
}

export class LLMService extends EventEmitter {
  private openai: OpenAI;
  private config: LLMConfig;

  constructor(apiKey: string, config: Partial<LLMConfig> = {}) {
    super();
    this.openai = new OpenAI({ apiKey });
    this.config = {
      model: 'gpt-4-turbo-preview',
      temperature: 0.7,
      maxTokens: 500,
      ...config,
    };
  }

  async generateAnswer(question: string, context?: string): Promise<AsyncGenerator<string>> {
    const systemPrompt = `あなたは面接の回答アシスタントです。
以下のガイドラインに従って回答を生成してください：

1. 簡潔で具体的な回答（200-300文字程度）
2. STAR法（状況、タスク、行動、結果）を意識
3. 前向きで誠実な表現
4. 専門用語は適度に使用
${context ? `\n5. 以下のコンテキスト情報を参考にする：\n${context}` : ''}`;

    const stream = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: true,
    });

    return this.streamResponse(stream);
  }

  private async *streamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        yield content;
      }
    }
  }
}
```

### 2.3 回答表示UI

`src/renderer/src/components/AnswerView.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

export const AnswerView: React.FC = () => {
  const [answer, setAnswer] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer.on('answer-chunk', (chunk: string) => {
      setAnswer((prev) => prev + chunk);
    });

    window.electron.ipcRenderer.on('answer-start', () => {
      setAnswer('');
      setIsGenerating(true);
    });

    window.electron.ipcRenderer.on('answer-end', () => {
      setIsGenerating(false);
    });

    return () => {
      window.electron.ipcRenderer.removeAllListeners('answer-chunk');
      window.electron.ipcRenderer.removeAllListeners('answer-start');
      window.electron.ipcRenderer.removeAllListeners('answer-end');
    };
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(answer);
  };

  return (
    <div className="h-full p-4 bg-base-100">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-bold">AI回答</h2>
        <button
          className="btn btn-sm btn-ghost"
          onClick={copyToClipboard}
          disabled={!answer}
        >
          📋 コピー
        </button>
      </div>

      <div className="prose prose-sm max-w-none">
        {isGenerating && !answer && (
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner loading-sm"></span>
            <span>生成中...</span>
          </div>
        )}
        {answer && <ReactMarkdown>{answer}</ReactMarkdown>}
      </div>
    </div>
  );
};
```

### 成果物確認

```bash
✅ 質問を自動検出（精度80%以上）
✅ 2秒以内に回答開始
✅ ストリーミング表示で体感速度向上
✅ マークダウン対応
```

---

## Phase 3: ステルスUI実装

**期間**: 2-3日
**目標**: 透明オーバーレイ + ホットキー + 画面共有非表示

### タスクリスト

- [ ] 透明ウィンドウ実装
- [ ] クリック透過
- [ ] グローバルホットキー
- [ ] タスクバー非表示
- [ ] 画面共有テスト

### 3.1 メインウィンドウ設定

`src/main/window.ts`:
```typescript
import { BrowserWindow, screen, globalShortcut } from 'electron';
import path from 'path';

export class MainWindow {
  private window: BrowserWindow | null = null;
  private isVisible: boolean = false;

  create() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    this.window = new BrowserWindow({
      width: 400,
      height: 600,
      x: width - 420,
      y: 20,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false, // 初期非表示
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // クリック透過（初期状態）
    this.window.setIgnoreMouseEvents(true, { forward: true });

    // 開発時のみDevTools
    if (process.env.NODE_ENV === 'development') {
      this.window.webContents.openDevTools({ mode: 'detach' });
    }

    this.window.loadFile(path.join(__dirname, '../renderer/index.html'));

    return this.window;
  }

  toggle() {
    if (!this.window) return;

    this.isVisible = !this.isVisible;

    if (this.isVisible) {
      this.window.show();
      this.window.setIgnoreMouseEvents(false);
      this.window.webContents.send('visibility-changed', true);
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true });
      this.window.webContents.send('visibility-changed', false);
      // 完全に非表示にはせず、透明度を上げる
    }
  }

  registerHotkey(key: string = 'CommandOrControl+Shift+A') {
    globalShortcut.register(key, () => {
      this.toggle();
    });
  }

  destroy() {
    globalShortcut.unregisterAll();
    this.window?.destroy();
    this.window = null;
  }
}
```

### 3.2 透明UIスタイル

`src/renderer/src/App.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import { TranscriptionView } from './components/TranscriptionView';
import { AnswerView } from './components/AnswerView';

export default function App() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    window.electron.ipcRenderer.on('visibility-changed', (visible: boolean) => {
      setIsVisible(visible);
    });
  }, []);

  return (
    <div
      className={`h-screen transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="h-full flex flex-col text-white">
        {/* ヘッダー */}
        <div className="p-2 bg-primary text-primary-content flex justify-between items-center">
          <span className="font-bold">Interview Bot</span>
          <div className="flex gap-2">
            <button className="btn btn-xs btn-ghost">⚙️</button>
            <button className="btn btn-xs btn-ghost">📋</button>
          </div>
        </div>

        {/* コンテンツエリア */}
        <div className="flex-1 grid grid-rows-2 gap-2 p-2">
          <TranscriptionView />
          <AnswerView />
        </div>

        {/* フッター */}
        <div className="p-2 text-xs text-center opacity-50">
          Ctrl+Shift+Aで表示/非表示
        </div>
      </div>
    </div>
  );
}
```

### 成果物確認

```bash
✅ Ctrl+Shift+Aで即座に表示/非表示
✅ Zoom/Teams画面共有でウィンドウが映らない
✅ タスクバーに表示されない
✅ 非表示時はクリック透過
```

---

## Phase 4-6の詳細

（続きは長くなるため、実装時に詳細を展開します）

### Phase 4: RAG実装
- LangChain統合
- Chroma/FAISSベクトルDB
- 履歴書PDF解析
- コンテキスト検索

### Phase 5: 設定・保存
- electron-store統合
- 設定画面UI
- 会話履歴保存
- JSONエクスポート

### Phase 6: ビルド
- electron-builder設定
- Windows .exe生成
- NSISインストーラー
- 署名（オプション）

---

## テスト戦略

### 単体テスト

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom
```

`tests/unit/question-detector.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { QuestionDetector } from '../../src/services/question-detector';

describe('QuestionDetector', () => {
  const detector = new QuestionDetector();

  it('should detect Japanese questions', () => {
    expect(detector.isQuestion('あなたの強みは何ですか？')).toBe(true);
    expect(detector.isQuestion('これまでの経験について教えてください')).toBe(true);
  });

  it('should not detect non-questions', () => {
    expect(detector.isQuestion('私はエンジニアです')).toBe(false);
  });
});
```

### E2Eテスト

```bash
pnpm add -D playwright @playwright/test
```

---

## デバッグ手法

### Electronメインプロセス

```bash
# Chrome DevToolsでデバッグ
pnpm dev --inspect
```

### レンダラープロセス

- F12キーでDevTools起動
- Reactコンポーネントは React DevTools使用

### ログ出力

`src/services/logger.service.ts`:
```typescript
import winston from 'winston';
import path from 'path';
import { app } from 'electron';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(app.getPath('userData'), 'logs', 'error.log'),
      level: 'error',
    }),
    new winston.transports.File({
      filename: path.join(app.getPath('userData'), 'logs', 'combined.log'),
    }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});
```

---

## 次のステップ

1. **Phase 0を開始**: `npm create @quick-start/electron`でプロジェクト作成
2. **APIキー取得**: Deepgram + OpenAI
3. **Phase 1実装**: 音声認識から開始

詳細な実装時は本ドキュメントを参照しながら進めてください。
