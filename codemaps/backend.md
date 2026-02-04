# Backend Codemap (Main Process)

> Freshness: 2026-02-04 | Auto-generated

## Service Layer

```
src/services/
├── stt.service.ts      # Deepgram STT
├── ai.service.ts       # OpenAI API
├── context.service.ts  # ドキュメント埋め込み・検索
├── document.service.ts # PDF/DOCX解析
└── logger.service.ts   # Winston ロガー
```

## STTService

**File**: [src/services/stt.service.ts](src/services/stt.service.ts)

```typescript
class STTService {
  connect(onTranscript: Callback): Promise<void>
  send(buffer: ArrayBuffer): void
  disconnect(): void
  isConnected(): boolean
}
```

- **外部依存**: Deepgram SDK (WebSocket)
- **モデル**: nova-2, 言語: ja
- **ライフサイクル**: stt:start で作成、stt:stop で破棄

## AIService

**File**: [src/services/ai.service.ts](src/services/ai.service.ts)

```typescript
class AIService {
  initialize(config: AIConfig): void
  generateResponse(question: string, context?: string): Promise<AIResponse>
  generateStreamResponse(question: string, context?: string, onChunk?: Callback): Promise<AIResponse>
  isInitialized(): boolean
}
```

- **外部依存**: OpenAI API
- **モデル**: gpt-4o-mini
- **設定**: max_tokens: 500, temperature: 0.7
- **パターン**: シングルトン

## ContextService

**File**: [src/services/context.service.ts](src/services/context.service.ts)

```typescript
class ContextService {
  initialize(apiKey: string): Promise<void>
  addDocument(metadata: DocumentMetadata, chunks: DocumentChunk[]): Promise<void>
  getRelevantContext(query: string, types?: DocumentType[]): Promise<ContextResult[]>
  removeDocument(id: string): Promise<void>
  getDocuments(): DocumentMetadata[]
}
```

- **ストレージ**: `{userData}/context-data.json`
- **埋め込み**: OpenAI text-embedding-3-small (1536次元)
- **検索**: コサイン類似度 (上位3件, 閾値0.7)
- **パターン**: 書き込みロック (レースコンディション防止)

## DocumentService

**File**: [src/services/document.service.ts](src/services/document.service.ts)

```typescript
class DocumentService {
  parseFile(filePath: string, buffer: Buffer): Promise<ParseResult>
  chunkText(text: string, documentId: string): Promise<DocumentChunk[]>
}
```

- **対応形式**: PDF (pdf-parse), DOCX (mammoth)
- **サイズ制限**: 10MB
- **チャンキング**: 500文字、50文字オーバーラップ

## IPC Handler Map

**File**: [src/main/ipc.ts](src/main/ipc.ts)

| Handler | Service | Method |
|---------|---------|--------|
| `stt:start` | STTService | connect() |
| `stt:stop` | STTService | disconnect() |
| `stt:audio` | STTService | send() |
| `ai:init` | AIService | initialize() |
| `ai:generate` | AIService | generateResponse() |
| `ai:generateStream` | AIService + ContextService | generateStreamResponse() |
| `document:upload` | DocumentService + ContextService | parseFile() + addDocument() |
| `document:list` | ContextService | getDocuments() |
| `document:remove` | ContextService | removeDocument() |

## Dependency Graph

```
ipc.ts
  ├── stt.service.ts ─── @deepgram/sdk
  ├── ai.service.ts ─── openai
  ├── context.service.ts
  │     ├── openai (embeddings)
  │     └── electron (app.getPath)
  ├── document.service.ts
  │     ├── pdf-parse
  │     ├── mammoth
  │     └── langchain/text_splitter
  └── logger.service.ts ─── winston
```
