export type DocumentType = 'resume' | 'job_posting' | 'expected_qa'

export interface DocumentMetadata {
  id: string
  name: string
  type: DocumentType
  uploadedAt: number
  chunkCount: number
  totalTokens: number
}

