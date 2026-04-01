/**
 * コンテキストサービス（クラウドRAG版）
 *
 * Phase 6: ローカルJSON保存からSupabase pgvector APIに移行
 * - ドキュメントのアップロード/削除/一覧: API経由
 * - ベクトル類似検索はWorker側(POST /api/documents/search)で実行
 */

import { createLogger } from './logger.service'
import { authService } from './auth.service'
import { getConfig } from '../config/env-config'
import type { DocumentMetadata, DocumentType } from '../types/document'

const log = createLogger('context-service')

const { apiBaseUrl: API_BASE_URL } = getConfig()

interface ApiDocumentResponse {
  success: boolean
  document?: {
    id: string
    name: string
    type: DocumentType
    status: string
    chunkCount: number
    wordCount: number
    uploadedAt: string
  }
  error?: string
}

interface ApiDocumentsListResponse {
  success: boolean
  documents: Array<{
    id: string
    name: string
    type: DocumentType
    status: string
    chunkCount: number
    wordCount?: number
    uploadedAt: string
  }>
  error?: string
}

class ContextService {
  private initialized = false

  /**
   * サービスを初期化
   * Phase 6ではAPIキー不要（サーバーサイドでEmbedding生成）
   */
  async initialize(): Promise<void> {
    this.initialized = true
    log.info('Context service initialized (Cloud RAG mode)')
  }

  /**
   * ドキュメントをアップロード
   * ファイルバッファをAPIに送信し、サーバーサイドで解析・Embedding生成
   */
  async addDocument(
    fileBuffer: Buffer,
    filename: string,
    documentType: DocumentType
  ): Promise<DocumentMetadata> {
    log.info('Uploading document to API', { name: filename, type: documentType })

    const formData = new FormData()
    formData.append('file', new Blob([fileBuffer]), filename)
    formData.append('type', documentType)

    const response = await authService.authenticatedFetch(`${API_BASE_URL}/api/documents`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      const errorMessage = errorData.error || `Upload failed: ${response.status}`
      log.error('Document upload failed', { error: errorMessage })
      throw new Error(errorMessage)
    }

    const data = (await response.json()) as ApiDocumentResponse

    if (!data.success || !data.document) {
      throw new Error(data.error || 'Failed to upload document')
    }

    log.info('Document uploaded successfully', { id: data.document.id })

    return {
      id: data.document.id,
      name: data.document.name,
      type: data.document.type,
      uploadedAt: new Date(data.document.uploadedAt).getTime(),
      chunkCount: data.document.chunkCount,
      totalTokens: Math.ceil((data.document.wordCount || 0) / 4),
    }
  }

  /**
   * ドキュメント一覧を取得
   */
  async getDocuments(): Promise<DocumentMetadata[]> {
    log.debug('Fetching documents from API')

    try {
      const response = await authService.authenticatedFetch(`${API_BASE_URL}/api/documents`, {
        method: 'GET',
      })

      if (!response.ok) {
        if (response.status === 401) {
          log.warn('Fetch documents failed: unauthorized')
          return []
        }
        throw new Error(`Failed to fetch documents: ${response.status}`)
      }

      const data = (await response.json()) as ApiDocumentsListResponse

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch documents')
      }

      return data.documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        uploadedAt: new Date(doc.uploadedAt).getTime(),
        chunkCount: doc.chunkCount,
        totalTokens: Math.ceil((doc.wordCount || 0) / 4),
      }))
    } catch (error) {
      log.error('Failed to fetch documents', { error: String(error) })
      return []
    }
  }

  /**
   * ドキュメントを削除
   */
  async removeDocument(documentId: string): Promise<void> {
    log.info('Removing document', { id: documentId })

    const response = await authService.authenticatedFetch(
      `${API_BASE_URL}/api/documents/${documentId}`,
      {
        method: 'DELETE',
      }
    )

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      const errorMessage = errorData.error || `Delete failed: ${response.status}`
      log.error('Document delete failed', { error: errorMessage })
      throw new Error(errorMessage)
    }

    log.info('Document removed successfully', { id: documentId })
  }

  /**
   * 初期化状態を確認
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

export const contextService = new ContextService()
