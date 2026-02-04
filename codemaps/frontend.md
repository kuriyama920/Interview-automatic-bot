# Frontend Codemap (Renderer Process)

> Freshness: 2026-02-04 | Auto-generated

## Structure

```
src/renderer/src/
├── main.tsx                  # Reactエントリーポイント
├── App.tsx                   # メインコンポーネント
├── components/
│   ├── DocumentUploadPanel.tsx  # ドキュメントアップロードUI
│   └── ErrorBoundary.tsx        # エラーバウンダリ
├── hooks/
│   ├── useSTT.ts             # STT接続管理
│   ├── useAudioCapture.ts    # 音声キャプチャ
│   ├── useAIResponse.ts      # AI回答生成
│   └── useDocuments.ts       # ドキュメントCRUD
├── types/
│   └── index.ts              # 型定義
└── utils/
    └── logger.ts             # 軽量ロガー
```

## Component Hierarchy

```
main.tsx
└── ErrorBoundary
    └── App.tsx
        ├── Header (フェーズバッジ)
        ├── Controls (ボタン、ステータス)
        └── Layout (3カラム)
            ├── DocumentUploadPanel
            │   ├── DocumentSection (resume)
            │   │   └── DocumentItem[]
            │   └── DocumentSection (job_posting)
            │       └── DocumentItem[]
            ├── Transcripts Card
            │   └── TranscriptItem[]
            └── AI Response Card
                ├── Answer
                ├── Suggestions[]
                └── Confidence
```

## Custom Hooks

### useSTT

**File**: [src/renderer/src/hooks/useSTT.ts](src/renderer/src/hooks/useSTT.ts)

```typescript
function useSTT() {
  return {
    isConnected: boolean,
    isConnecting: boolean,
    transcripts: TranscriptResult[],
    currentText: string,        // インテリム表示用
    error: string | null,
    connect: () => Promise<void>,
    disconnect: () => Promise<void>,
    clearTranscripts: () => void
  }
}
```

### useAudioCapture

**File**: [src/renderer/src/hooks/useAudioCapture.ts](src/renderer/src/hooks/useAudioCapture.ts)

```typescript
function useAudioCapture() {
  return {
    isCapturing: boolean,
    error: string | null,
    startCapture: () => Promise<void>,
    stopCapture: () => void
  }
}
```

**Audio Pipeline**:
```
getUserMedia → AudioContext → ScriptProcessor
    ↓
Resample (any → 16kHz) → Float32 → Int16
    ↓
window.electron.stt.sendAudio(buffer)
```

### useAIResponse

**File**: [src/renderer/src/hooks/useAIResponse.ts](src/renderer/src/hooks/useAIResponse.ts)

```typescript
function useAIResponse() {
  return {
    response: AIResponse | null,
    streamingText: string,      // リアルタイム表示
    isGenerating: boolean,
    error: string | null,
    generateStreamResponse: (question: string) => Promise<void>,
    clearResponse: () => void
  }
}
```

### useDocuments

**File**: [src/renderer/src/hooks/useDocuments.ts](src/renderer/src/hooks/useDocuments.ts)

```typescript
function useDocuments() {
  return {
    documents: DocumentMetadata[],
    isLoading: boolean,
    error: string | null,
    uploadDocument: (type: DocumentType) => Promise<void>,
    removeDocument: (id: string) => Promise<void>,
    refreshDocuments: () => Promise<void>
  }
}
```

## Electron API (Preload)

**File**: [src/preload/index.ts](src/preload/index.ts)

```typescript
window.electron = {
  stt: {
    start: (apiKey) => invoke('stt:start', apiKey),
    stop: () => invoke('stt:stop'),
    sendAudio: (buffer) => send('stt:audio', buffer),
    onTranscript: (callback) => on('stt:transcript', callback),
    status: () => invoke('stt:status')
  },
  ai: {
    init: (config) => invoke('ai:init', config),
    generate: (question, context) => invoke('ai:generate', question, context),
    generateStream: (question, context) => invoke('ai:generateStream', question, context),
    onChunk: (callback) => on('ai:chunk', callback),
    onComplete: (callback) => on('ai:complete', callback),
    onError: (callback) => on('ai:error', callback),
    status: () => invoke('ai:status')
  },
  document: {
    upload: (type) => invoke('document:upload', type),
    list: () => invoke('document:list'),
    remove: (id) => invoke('document:remove', id)
  },
  context: {
    init: () => invoke('context:init')
  },
  config: {
    getApiKey: (key) => invoke('config:getApiKey', key)
  }
}
```

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Header: AI面接支援 | Phase 1 ✓ | Phase 2 ✓ | Phase 3       │
├─────────────────────────────────────────────────────────────┤
│ Controls: [録音開始] [AI生成] | ● Connected | ● Ready      │
├──────────────┬─────────────────────────┬────────────────────┤
│ Documents    │ Transcripts             │ AI Response        │
│              │                         │                    │
│ [履歴書追加] │ Q: ご経験を...          │ 回答:              │
│ - resume.pdf │ Q: なぜ弊社...          │ 私は...            │
│              │ Q: 強みは...            │                    │
│ [求人票追加] │                         │ 提案:              │
│ - job.docx   │ (インテリム表示)        │ • ポイント1        │
│              │                         │ • ポイント2        │
└──────────────┴─────────────────────────┴────────────────────┘
```
