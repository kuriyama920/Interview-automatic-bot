import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockAuthenticatedFetch } = vi.hoisted(() => ({
  mockAuthenticatedFetch: vi.fn(),
}))

vi.mock('../../src/services/auth.service', () => ({
  authService: {
    authenticatedFetch: mockAuthenticatedFetch,
  },
}))

vi.mock('../../src/services/logger.service', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { contextService } from '../../src/services/context.service'

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

describe('contextService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialize', () => {
    it('should initialize without error', async () => {
      await expect(contextService.initialize()).resolves.toBeUndefined()
    })

    it('should report as initialized after initialize()', async () => {
      await contextService.initialize()
      expect(contextService.isInitialized()).toBe(true)
    })
  })

  describe('isInitialized', () => {
    it('should return a boolean', () => {
      expect(typeof contextService.isInitialized()).toBe('boolean')
    })
  })

  describe('addDocument', () => {
    it('should upload document and return metadata', async () => {
      const mockResponseBody = {
        success: true,
        document: {
          id: 'doc-123',
          name: 'resume.pdf',
          type: 'resume',
          status: 'ready',
          chunkCount: 5,
          wordCount: 200,
          uploadedAt: '2024-01-01T00:00:00.000Z',
        },
      }
      mockAuthenticatedFetch.mockResolvedValue(makeResponse(mockResponseBody))

      const buffer = Buffer.from('test content')
      const result = await contextService.addDocument(buffer, 'resume.pdf', 'resume')

      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents'),
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.id).toBe('doc-123')
      expect(result.name).toBe('resume.pdf')
      expect(result.type).toBe('resume')
      expect(result.chunkCount).toBe(5)
    })

    it('should throw error when response is not ok', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({ error: 'Upload failed: file too large' }, 400)
      )

      const buffer = Buffer.from('test content')
      await expect(contextService.addDocument(buffer, 'test.pdf', 'resume')).rejects.toThrow(
        'Upload failed: file too large'
      )
    })

    it('should throw error when success is false', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({ success: false, error: 'Processing failed' })
      )

      const buffer = Buffer.from('test content')
      await expect(contextService.addDocument(buffer, 'test.pdf', 'resume')).rejects.toThrow(
        'Processing failed'
      )
    })

    it('should use generic error message when no error detail in 5xx response', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({}, 500))

      const buffer = Buffer.from('test content')
      await expect(contextService.addDocument(buffer, 'test.pdf', 'resume')).rejects.toThrow(
        'Upload failed: 500'
      )
    })
  })

  describe('getRelevantContext', () => {
    it('should return empty array for empty query', async () => {
      const result = await contextService.getRelevantContext('')
      expect(result).toEqual([])
      expect(mockAuthenticatedFetch).not.toHaveBeenCalled()
    })

    it('should return empty array for whitespace-only query', async () => {
      const result = await contextService.getRelevantContext('   ')
      expect(result).toEqual([])
    })

    it('should return context results for valid query', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({
          success: true,
          results: [
            {
              documentId: 'doc-1',
              documentName: '職務経歴書.pdf',
              documentType: 'resume',
              chunks: [
                { content: '5年間のエンジニア経験', similarity: 0.9 },
              ],
            },
          ],
        })
      )

      const results = await contextService.getRelevantContext('経験について教えてください')
      expect(results).toHaveLength(1)
      expect(results[0].documentName).toBe('職務経歴書.pdf')
      expect(results[0].chunks).toEqual(['5年間のエンジニア経験'])
      expect(results[0].similarity).toBe(0.9)
    })

    it('should return empty array on 401 unauthorized', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({ error: 'Unauthorized' }, 401))

      const results = await contextService.getRelevantContext('test query')
      expect(results).toEqual([])
    })

    it('should return empty array on non-ok response', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({ error: 'Server error' }, 500))

      const results = await contextService.getRelevantContext('test query')
      expect(results).toEqual([])
    })

    it('should return empty array when API returns success false', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({ success: false, results: [], error: 'No results' })
      )

      const results = await contextService.getRelevantContext('test query')
      expect(results).toEqual([])
    })

    it('should return empty array on network error', async () => {
      mockAuthenticatedFetch.mockRejectedValue(new Error('Network error'))

      const results = await contextService.getRelevantContext('test query')
      expect(results).toEqual([])
    })
  })

  describe('getDocuments', () => {
    it('should return list of documents', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({
          success: true,
          documents: [
            {
              id: 'doc-1',
              name: '職務経歴書.pdf',
              type: 'resume',
              status: 'ready',
              chunkCount: 10,
              wordCount: 500,
              uploadedAt: '2024-01-01T00:00:00.000Z',
            },
          ],
        })
      )

      const docs = await contextService.getDocuments()
      expect(docs).toHaveLength(1)
      expect(docs[0].id).toBe('doc-1')
      expect(docs[0].name).toBe('職務経歴書.pdf')
      expect(docs[0].chunkCount).toBe(10)
    })

    it('should return empty array on 401 unauthorized', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({ error: 'Unauthorized' }, 401))

      const docs = await contextService.getDocuments()
      expect(docs).toEqual([])
    })

    it('should return empty array on network error', async () => {
      mockAuthenticatedFetch.mockRejectedValue(new Error('Network error'))

      const docs = await contextService.getDocuments()
      expect(docs).toEqual([])
    })

    it('should return empty array on 500 error (caught)', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({}, 500))

      const docs = await contextService.getDocuments()
      expect(docs).toEqual([])
    })

    it('should return empty array when API returns success false (caught)', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({ success: false, documents: [], error: 'DB error' })
      )

      const docs = await contextService.getDocuments()
      expect(docs).toEqual([])
    })
  })

  describe('removeDocument', () => {
    it('should remove document successfully', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({ success: true }))

      await expect(contextService.removeDocument('doc-123')).resolves.toBeUndefined()
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-123'),
        expect.objectContaining({ method: 'DELETE' })
      )
    })

    it('should throw error when response is not ok', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        makeResponse({ error: 'Document not found' }, 404)
      )

      await expect(contextService.removeDocument('doc-999')).rejects.toThrow('Document not found')
    })

    it('should use generic error message when no error detail', async () => {
      mockAuthenticatedFetch.mockResolvedValue(makeResponse({}, 500))

      await expect(contextService.removeDocument('doc-999')).rejects.toThrow('Delete failed: 500')
    })
  })
})
