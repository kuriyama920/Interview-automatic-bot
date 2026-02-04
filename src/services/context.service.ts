import OpenAI from 'openai'
import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { createLogger } from './logger.service'
import type {
  DocumentChunk,
  DocumentMetadata,
  DocumentType,
  ContextResult,
} from '../types/document'

const log = createLogger('context-service')

const EMBEDDING_MODEL = 'text-embedding-3-small'
const TOP_K = 3
const MIN_SIMILARITY = 0.7

interface StoredData {
  metadata: DocumentMetadata[]
  chunks: DocumentChunk[]
}

export class ContextService {
  private client: OpenAI | null = null
  private dataPath: string = ''
  private data: StoredData = { metadata: [], chunks: [] }
  private initialized = false
  private writeLock: Promise<void> = Promise.resolve()

  async initialize(apiKey: string): Promise<void> {
    this.client = new OpenAI({ apiKey })
    this.dataPath = path.join(app.getPath('userData'), 'context-data.json')
    await this.loadData()
    this.initialized = true
    log.info('Context service initialized', { dataPath: this.dataPath })
  }

  private async loadData(): Promise<void> {
    try {
      const content = await fs.readFile(this.dataPath, 'utf-8')
      this.data = JSON.parse(content)
      log.info('Loaded context data', {
        documents: this.data.metadata.length,
        chunks: this.data.chunks.length,
      })
    } catch {
      log.debug('No existing context data found, starting fresh')
      this.data = { metadata: [], chunks: [] }
    }
  }

  private async saveData(): Promise<void> {
    await fs.writeFile(this.dataPath, JSON.stringify(this.data, null, 2))
    log.debug('Context data saved')
  }

  async addDocument(
    metadata: DocumentMetadata,
    chunks: Omit<DocumentChunk, 'embedding'>[]
  ): Promise<void> {
    // Use write lock to prevent race conditions
    const operation = async () => {
      if (!this.client) {
        throw new Error('Context service not initialized')
      }

      log.info('Adding document', { name: metadata.name, chunks: chunks.length })

      const embeddedChunks: DocumentChunk[] = []
      const batchSize = 20

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize)
        const texts = batch.map((c) => c.content)

        try {
          const response = await this.client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: texts,
          })

          batch.forEach((chunk, idx) => {
            embeddedChunks.push({
              ...chunk,
              embedding: response.data[idx].embedding,
            })
          })

          log.debug(`Embedded batch ${Math.floor(i / batchSize) + 1}`)

          // Rate limit protection - add delay between batches
          if (i + batchSize < chunks.length) {
            await new Promise((resolve) => setTimeout(resolve, 100))
          }
        } catch (error) {
          log.error('Failed to generate embeddings', { error: String(error) })
          throw new Error('Failed to generate embeddings. Please try again.')
        }
      }

      // Remove existing document if updating (immutable pattern)
      this.data = {
        ...this.data,
        metadata: this.data.metadata.filter((m) => m.id !== metadata.id),
        chunks: this.data.chunks.filter((c) => c.documentId !== metadata.id),
      }

      // Add new data
      this.data.metadata.push({ ...metadata, chunkCount: embeddedChunks.length })
      this.data.chunks.push(...embeddedChunks)

      await this.saveData()
      log.info('Document added successfully', { id: metadata.id })
    }

    // Queue this operation to prevent concurrent writes
    this.writeLock = this.writeLock.then(operation).catch((error) => {
      throw error
    })

    await this.writeLock
  }

  async getRelevantContext(
    query: string,
    documentTypes?: DocumentType[]
  ): Promise<ContextResult[]> {
    if (!this.client || this.data.chunks.length === 0) {
      return []
    }

    log.debug('Getting relevant context', { query: query.substring(0, 50) })

    try {
      const response = await this.client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: query,
      })
      const queryEmbedding = response.data[0].embedding

      // Filter chunks by document type if specified
      let chunks = this.data.chunks
      if (documentTypes && documentTypes.length > 0) {
        const docIds = this.data.metadata
          .filter((m) => documentTypes.includes(m.type))
          .map((m) => m.id)
        chunks = chunks.filter((c) => docIds.includes(c.documentId))
      }

      // Calculate similarity and sort
      const results = chunks
        .map((chunk) => ({
          chunk,
          similarity: this.cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .filter((r) => r.similarity >= MIN_SIMILARITY)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, TOP_K)

      // Group by document - use Map for O(1) lookup
      const metadataMap = new Map(this.data.metadata.map((m) => [m.id, m]))
      const groupedResults: Map<string, ContextResult> = new Map()

      for (const { chunk, similarity } of results) {
        const meta = metadataMap.get(chunk.documentId)
        if (!meta) continue

        if (!groupedResults.has(chunk.documentId)) {
          groupedResults.set(chunk.documentId, {
            chunks: [],
            documentType: meta.type,
            documentName: meta.name,
            similarity,
          })
        }
        groupedResults.get(chunk.documentId)!.chunks.push(chunk.content)
      }

      log.debug('Context retrieved', { resultCount: groupedResults.size })
      return Array.from(groupedResults.values())
    } catch (error) {
      log.error('Failed to get relevant context', { error: String(error) })
      return []
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    // Handle zero vectors to avoid NaN
    const denominator = Math.sqrt(normA) * Math.sqrt(normB)
    if (denominator === 0) {
      return 0
    }

    return dotProduct / denominator
  }

  getDocuments(): DocumentMetadata[] {
    return [...this.data.metadata]
  }

  async removeDocument(documentId: string): Promise<void> {
    const operation = async () => {
      this.data = {
        ...this.data,
        metadata: this.data.metadata.filter((m) => m.id !== documentId),
        chunks: this.data.chunks.filter((c) => c.documentId !== documentId),
      }
      await this.saveData()
      log.info('Document removed', { id: documentId })
    }

    // Queue this operation to prevent concurrent writes
    this.writeLock = this.writeLock.then(operation)
    await this.writeLock
  }

  isInitialized(): boolean {
    return this.initialized
  }
}

export const contextService = new ContextService()
