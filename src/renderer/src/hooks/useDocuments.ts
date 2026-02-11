import { useState, useCallback, useEffect, useRef } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useDocuments')

type DocumentType = 'resume' | 'job_posting' | 'expected_qa'

interface DocumentInfo {
  id: string
  name: string
  type: DocumentType
  uploadedAt: number
  chunkCount: number
}

interface UseDocumentsReturn {
  documents: DocumentInfo[]
  isUploading: boolean
  isInitialized: boolean
  error: string | null
  uploadDocument: (type: DocumentType) => Promise<void>
  removeDocument: (id: string) => Promise<void>
  refreshDocuments: () => Promise<void>
}

export function useDocuments(): UseDocumentsReturn {
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const initRef = useRef(false)

  const refreshDocuments = useCallback(async () => {
    try {
      const result = await window.electron.document.list()
      if (mountedRef.current && result.success) {
        setDocuments(result.documents)
      }
    } catch (err) {
      log.error('Failed to refresh documents', { error: err })
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    const init = async () => {
      if (initRef.current) return
      initRef.current = true

      log.debug('Initializing document service')
      try {
        const result = await window.electron.document.init()
        if (mountedRef.current) {
          if (result.success) {
            setIsInitialized(true)
            await refreshDocuments()
            log.info('Document service initialized')
          } else {
            setError(result.error || 'Failed to initialize document service')
            log.error('Document service initialization failed', { error: result.error })
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setError(message)
          log.error('Document service initialization error', { error: message })
        }
      }
    }

    init()

    return () => {
      log.debug('Cleanup - useDocuments unmounted')
      mountedRef.current = false
    }
  }, [refreshDocuments])

  const uploadDocument = useCallback(
    async (type: DocumentType) => {
      setIsUploading(true)
      setError(null)
      log.info('Uploading document', { type })

      try {
        const result = await window.electron.document.upload(type)
        if (mountedRef.current) {
          if (result.success && result.document) {
            log.info('Document uploaded', { document: result.document })
            await refreshDocuments()
          } else if (result.error && result.error !== 'No file selected') {
            // ネットワークエラーのユーザーフレンドリーなメッセージ
            const errorMessage = result.error.includes('fetch')
              ? 'ネットワーク接続を確認してください'
              : result.error.includes('Unauthorized') || result.error.includes('認証')
                ? '認証の有効期限が切れました。再ログインしてください'
                : result.error
            setError(errorMessage)
            log.error('Document upload failed', { error: result.error })
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setError(message)
          log.error('Document upload error', { error: message })
        }
      } finally {
        if (mountedRef.current) {
          setIsUploading(false)
        }
      }
    },
    [refreshDocuments]
  )

  const removeDocument = useCallback(
    async (id: string) => {
      log.info('Removing document', { id })

      try {
        const result = await window.electron.document.remove(id)
        if (mountedRef.current) {
          if (result.success) {
            await refreshDocuments()
            log.info('Document removed', { id })
          } else {
            setError(result.error || 'Failed to remove document')
            log.error('Document removal failed', { error: result.error })
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setError(message)
          log.error('Document removal error', { error: message })
        }
      }
    },
    [refreshDocuments]
  )

  return {
    documents,
    isUploading,
    isInitialized,
    error,
    uploadDocument,
    removeDocument,
    refreshDocuments,
  }
}
