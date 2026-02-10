import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService } from '../../src/services/ai.service'

// Mock OpenAI
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content:
                    'これは回答例です。具体的なエピソードを交えて説明しています。\n\n- ポイント1: 経験を具体的に\n- ポイント2: 数値で示す\n- ポイント3: 結果を強調',
                },
              },
            ],
          }),
        },
      },
    })),
  }
})

// Mock logger
vi.mock('../../src/services/logger.service', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

describe('AIService', () => {
  let aiService: AIService

  beforeEach(() => {
    aiService = new AIService()
  })

  describe('initialize', () => {
    it('should initialize with API key', () => {
      aiService.initialize({ apiKey: 'test-api-key' })
      expect(aiService.isInitialized()).toBe(true)
    })

    it('should use default config values', () => {
      aiService.initialize({ apiKey: 'test-api-key' })
      expect(aiService.isInitialized()).toBe(true)
    })

    it('should allow custom config', () => {
      aiService.initialize({
        apiKey: 'test-api-key',
        model: 'gpt-4',
        maxTokens: 1000,
      })
      expect(aiService.isInitialized()).toBe(true)
    })
  })

  describe('generateResponse', () => {
    beforeEach(() => {
      aiService.initialize({ apiKey: 'test-api-key' })
    })

    it('should throw error if not initialized', async () => {
      const uninitializedService = new AIService()
      await expect(uninitializedService.generateResponse('test question')).rejects.toThrow(
        'AI service not initialized'
      )
    })

    it('should generate response for a question', async () => {
      const response = await aiService.generateResponse('自己紹介をしてください')

      expect(response).toHaveProperty('answer')
      expect(response).toHaveProperty('suggestions')
      expect(response).toHaveProperty('confidence')
      expect(response.answer).toBeTruthy()
      expect(Array.isArray(response.suggestions)).toBe(true)
    })

    it('should include context if provided', async () => {
      const response = await aiService.generateResponse('志望動機を教えてください', 'エンジニア職への応募')

      expect(response).toHaveProperty('answer')
    })
  })

  describe('parseResponse', () => {
    beforeEach(() => {
      aiService.initialize({ apiKey: 'test-api-key' })
    })

    it('should parse response with suggestions', async () => {
      const response = await aiService.generateResponse('質問')

      expect(response.suggestions.length).toBeGreaterThan(0)
      expect(response.suggestions[0]).not.toMatch(/^[-•]/)
    })
  })

  describe('isInitialized', () => {
    it('should return false before initialization', () => {
      expect(aiService.isInitialized()).toBe(false)
    })

    it('should return true after initialization', () => {
      aiService.initialize({ apiKey: 'test-api-key' })
      expect(aiService.isInitialized()).toBe(true)
    })
  })

})
