export type DocumentType = 'resume' | 'job_posting'

export interface DocumentMetadata {
  id: string
  name: string
  type: DocumentType
  uploadedAt: number
  chunkCount: number
  totalTokens: number
}

export interface ContextResult {
  chunks: string[]
  documentType: DocumentType
  documentName: string
  similarity: number
}
