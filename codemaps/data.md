# Data Models Codemap

> Freshness: 2026-02-04 | Auto-generated

## Type Definitions

### Document Types

**File**: [src/types/document.ts](src/types/document.ts)

```typescript
type DocumentType = 'resume' | 'job_posting'

interface DocumentMetadata {
  id: string              // UUID v4
  name: string            // ファイル名
  type: DocumentType
  uploadedAt: number      // タイムスタンプ
  chunkCount: number      // チャンク数
  totalTokens: number     // 推定トークン数
}

interface DocumentChunk {
  id: string              // "{docId}-chunk-{index}"
  documentId: string      // ドキュメント参照
  content: string         // テキスト (500文字)
  embedding: number[]     // 1536次元ベクトル
  metadata: {
    chunkIndex: number
  }
}

interface ContextResult {
  chunks: string[]        // 上位3件の類似チャンク
  documentType: DocumentType
  documentName: string
  similarity: number      // 0-1 コサイン類似度
}
```

### Transcript Types

**File**: [src/renderer/src/types/index.ts](src/renderer/src/types/index.ts)

```typescript
interface TranscriptResult {
  text: string            // 認識テキスト
  isFinal: boolean        // Deepgram final flag
  confidence: number      // 0-1 信頼度
  timestamp: number       // 受信時刻
}
```

### AI Response Types

**File**: [src/services/ai.service.ts](src/services/ai.service.ts)

```typescript
interface AIResponse {
  answer: string          // メイン回答
  suggestions: string[]   // 2-5個の提案
  confidence: number      // 固定値 0.85
}

interface AIConfig {
  apiKey: string
  model?: string          // default: gpt-4o-mini
  maxTokens?: number      // default: 500
  temperature?: number    // default: 0.7
}
```

## Storage Schema

### context-data.json

**Location**: `{userData}/context-data.json`

```json
{
  "metadata": [
    {
      "id": "uuid-v4",
      "name": "履歴書.pdf",
      "type": "resume",
      "uploadedAt": 1706745600000,
      "chunkCount": 5,
      "totalTokens": 1250
    }
  ],
  "chunks": [
    {
      "id": "uuid-v4-chunk-0",
      "documentId": "uuid-v4",
      "content": "チャンクテキスト...",
      "embedding": [0.123, -0.456, ...],  // 1536 floats
      "metadata": {
        "chunkIndex": 0
      }
    }
  ]
}
```

## Data Flow Diagrams

### Document Upload Flow

```
File Selection
    ↓
┌─────────────────────────────┐
│ DocumentService.parseFile() │
│   PDF → pdfParse           │
│   DOCX → mammoth           │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ DocumentService.chunkText() │
│   500 chars / 50 overlap   │
│   RecursiveTextSplitter    │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ ContextService.addDocument()│
│   OpenAI embeddings        │
│   Batch of 20              │
└─────────────┬───────────────┘
              ↓
        context-data.json
```

### Semantic Search Flow

```
User Question
    ↓
┌─────────────────────────────┐
│ OpenAI embeddings          │
│   text-embedding-3-small   │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ Cosine Similarity Search   │
│   threshold: 0.7           │
│   top: 3                   │
└─────────────┬───────────────┘
              ↓
┌─────────────────────────────┐
│ ContextResult[]            │
│   chunks, similarity       │
└─────────────────────────────┘
```

## Validation Rules

| Field | Validation |
|-------|------------|
| File size | max 10MB |
| File type | .pdf, .docx |
| Chunk size | 500 chars |
| Chunk overlap | 50 chars |
| Embedding dim | 1536 |
| Similarity threshold | 0.7 |
| Top K results | 3 |

## Immutability Pattern

```typescript
// ContextService での更新パターン

// 追加
const newData = {
  ...data,
  metadata: [...data.metadata, newMetadata],
  chunks: [...data.chunks, ...newChunks]
}

// 削除
const newData = {
  ...data,
  metadata: data.metadata.filter(m => m.id !== id),
  chunks: data.chunks.filter(c => c.documentId !== id)
}
```
