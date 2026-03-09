import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '../../src/services/ai.service'

// Mock auth service
const mockAuthenticatedFetch = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/auth.service', () => ({
  authService: {
    authenticatedFetch: mockAuthenticatedFetch,
  },
}))

// Mock logger
vi.mock('../../src/services/logger.service', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

/**
 * SSE形式のレスポンスモックを作成
 */
function createSSEResponse(content: string) {
  const encoder = new TextEncoder()
  const sseData = [
    `data: ${JSON.stringify({ type: 'chunk', content })}`,
    `data: ${JSON.stringify({ type: 'done' })}`,
    '',
  ].join('\n')

  let readCount = 0
  const reader = {
    read: vi.fn().mockImplementation(async () => {
      if (readCount === 0) {
        readCount++
        return { done: false, value: encoder.encode(sseData) }
      }
      return { done: true, value: undefined }
    }),
    releaseLock: vi.fn(),
  }

  return {
    ok: true,
    body: { getReader: () => reader },
  }
}

describe('AIService', () => {
  let aiService: AIService

  beforeEach(() => {
    vi.clearAllMocks()
    aiService = new AIService()
  })

  describe('initialize', () => {
    it('should initialize with apiBaseUrl', () => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
      expect(aiService.isInitialized()).toBe(true)
    })

    it('should use default config values', () => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
      expect(aiService.isInitialized()).toBe(true)
    })

    it('should allow custom config', () => {
      aiService.initialize({
        apiBaseUrl: 'https://api.example.com',
        model: 'gpt-4',
        maxTokens: 1000,
      })
      expect(aiService.isInitialized()).toBe(true)
    })
  })

  describe('generateResponse', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('should throw error if not initialized', async () => {
      const uninitializedService = new AIService()
      await expect(uninitializedService.generateResponse('test question')).rejects.toThrow(
        'AI service not initialized'
      )
    })

    it('should generate response for a question', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('これは回答例です。具体的なエピソードを交えて説明しています。')
      )

      const response = await aiService.generateResponse('自己紹介をしてください')

      expect(response).toHaveProperty('answer')
      expect(response).toHaveProperty('suggestions')
      expect(response).toHaveProperty('confidence')
      expect(response.answer).toBeTruthy()
      expect(Array.isArray(response.suggestions)).toBe(true)
    })

    it('should include context if provided', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('志望動機の回答です。')
      )

      const response = await aiService.generateResponse('志望動機を教えてください', 'エンジニア職への応募')

      expect(response).toHaveProperty('answer')
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/generate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('エンジニア職への応募'),
        })
      )
    })

    it('should throw on non-ok response', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'API error' }),
      })

      await expect(aiService.generateResponse('質問')).rejects.toThrow('API error')
    })
  })

  describe('parseResponse', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('should parse response content', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('回答テキスト')
      )

      const response = await aiService.generateResponse('質問')

      expect(response.answer).toBe('回答テキスト')
      expect(response.confidence).toBe(-1)
    })
  })

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(aiService.isInitialized()).toBe(false)
    })

    it('should return true after initialization', () => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
      expect(aiService.isInitialized()).toBe(true)
    })
  })
})
