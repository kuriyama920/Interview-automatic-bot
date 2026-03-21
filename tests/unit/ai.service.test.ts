import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AIService, type WorkerMetrics, type DoneData } from '../../src/services/ai.service'

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

    it('should use default model gpt-5-nano and maxTokens 800', async () => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('test'))

      await aiService.generateResponse('質問')

      const callBody = JSON.parse(
        (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(callBody.model).toBe('gpt-5-nano')
      expect(callBody.maxTokens).toBe(800)
    })

    it('should use custom model and maxTokens when provided', async () => {
      aiService.initialize({
        apiBaseUrl: 'https://api.example.com',
        model: 'gpt-4',
        maxTokens: 1000,
      })
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('test'))

      await aiService.generateResponse('質問')

      const callBody = JSON.parse(
        (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(callBody.model).toBe('gpt-4')
      expect(callBody.maxTokens).toBe(1000)
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

    it('should generate response and return exact content from SSE', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('これは回答例です。具体的なエピソードを交えて説明しています。')
      )

      const response = await aiService.generateResponse('自己紹介をしてください')

      expect(response.answer).toBe('これは回答例です。具体的なエピソードを交えて説明しています。')
      expect(response.suggestions).toEqual([])
      expect(response.confidence).toBe(-1)
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

  describe('generateStreamResponse', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('should throw error if not initialized', async () => {
      const uninitializedService = new AIService()
      await expect(
        uninitializedService.generateStreamResponse('test')
      ).rejects.toThrow('AI service not initialized')
    })

    it('should stream response with onChunk callback', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('ストリーム回答です。')
      )

      const chunks: string[] = []
      const result = await aiService.generateStreamResponse(
        '質問です',
        undefined,
        { onChunk: (chunk) => chunks.push(chunk) },
      )

      expect(result.answer).toBe('ストリーム回答です。')
      expect(chunks).toContain('ストリーム回答です。')
    })

    it('should throw on non-ok response', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Stream error' }),
      })

      await expect(
        aiService.generateStreamResponse('質問')
      ).rejects.toThrow('Stream error')
    })

    it('should handle phase callback', async () => {
      const encoder = new TextEncoder()
      const sseData = [
        `data: ${JSON.stringify({ type: 'phase', phase: 'detailed' })}`,
        `data: ${JSON.stringify({ type: 'chunk', content: '詳細回答' })}`,
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

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      const phases: string[] = []
      const result = await aiService.generateStreamResponse(
        '質問',
        undefined,
        { onPhase: (phase) => phases.push(phase) },
      )

      expect(phases).toContain('detailed')
      // phase 'detailed' resets fullContent, so only content after reset
      expect(result.answer).toBe('詳細回答')
    })

    it('should handle SSE error event', async () => {
      const encoder = new TextEncoder()
      const sseData = [
        `data: ${JSON.stringify({ type: 'error', error: 'Server overloaded' })}`,
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

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      await expect(
        aiService.generateStreamResponse('質問')
      ).rejects.toThrow('Server overloaded')
    })

    it('should handle abort signal', async () => {
      const controller = new AbortController()
      controller.abort()

      const encoder = new TextEncoder()
      let readCount = 0
      const reader = {
        read: vi.fn().mockImplementation(async () => {
          if (readCount === 0) {
            readCount++
            return { done: false, value: encoder.encode('data: {"type":"chunk","content":"partial"}\n') }
          }
          return { done: true, value: undefined }
        }),
        releaseLock: vi.fn(),
      }

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      const result = await aiService.generateStreamResponse(
        '質問',
        undefined,
        undefined,
        controller.signal,
      )

      // Aborted signal breaks the loop before reading
      expect(result.answer).toBe('')
    })

    it('should handle no response body', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: null,
      })

      await expect(
        aiService.generateStreamResponse('質問')
      ).rejects.toThrow('Response body is not readable')
    })

    it('should not include predictedAnswer in request body (removed)', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('回答')
      )

      await aiService.generateStreamResponse(
        '質問',
        'コンテキスト',
      )

      const callBody = JSON.parse(
        (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(callBody).not.toHaveProperty('predictedAnswer')
      expect(callBody).not.toHaveProperty('cascading')
    })

    it('should not include cascading in request body even if somehow passed', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('回答')
      )

      // GenerateOptions から cascading は型レベルで削除されているが、
      // 万が一渡されても無視されることを確認
      await aiService.generateStreamResponse(
        '質問',
        'コンテキスト',
        undefined,
        undefined,
        { predictedAnswer: '予測回答' } as Record<string, unknown>,
      )

      const callBody = JSON.parse(
        (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(callBody).not.toHaveProperty('cascading')
    })

    it('should send X-Turn-Id header when turnId is provided in options', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('回答')
      )

      await aiService.generateStreamResponse(
        '質問',
        'コンテキスト',
        undefined,
        undefined,
        { turnId: 'turn-abc-123' },
      )

      const callHeaders = (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
      expect(callHeaders['X-Turn-Id']).toBe('turn-abc-123')
    })

    it('should not send X-Turn-Id header when turnId is not provided', async () => {
      mockAuthenticatedFetch.mockResolvedValue(
        createSSEResponse('回答')
      )

      await aiService.generateStreamResponse(
        '質問',
        'コンテキスト',
        undefined,
        undefined,
        { predictedAnswer: '予測回答' },
      )

      const callHeaders = (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
      expect(callHeaders).not.toHaveProperty('X-Turn-Id')
    })

    it('should call onMetrics callback when metrics SSE event is received', async () => {
      const encoder = new TextEncoder()
      const metricsData: WorkerMetrics = {
        turnId: 'turn-abc-123',
        m4: 100,
        m5: 200,
        m6: 300,
        m7: 400,
        m8: 500,
        m9: 600,
      }
      const sseData = [
        `data: ${JSON.stringify({ type: 'chunk', content: '回答テキスト' })}`,
        `data: ${JSON.stringify({ type: 'metrics', data: metricsData })}`,
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

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      const receivedMetrics: WorkerMetrics[] = []
      await aiService.generateStreamResponse(
        '質問',
        undefined,
        { onMetrics: (metrics) => receivedMetrics.push(metrics) },
      )

      expect(receivedMetrics).toHaveLength(1)
      expect(receivedMetrics[0].turnId).toBe('turn-abc-123')
      expect(receivedMetrics[0].m4).toBe(100)
      expect(receivedMetrics[0].m5).toBe(200)
      expect(receivedMetrics[0].m6).toBe(300)
      expect(receivedMetrics[0].m7).toBe(400)
      expect(receivedMetrics[0].m8).toBe(500)
      expect(receivedMetrics[0].m9).toBe(600)
    })

    it('should ignore metrics event when onMetrics callback is not provided', async () => {
      const encoder = new TextEncoder()
      const metricsData: WorkerMetrics = {
        turnId: 'turn-xyz',
        m4: 50,
      }
      const sseData = [
        `data: ${JSON.stringify({ type: 'chunk', content: '回答' })}`,
        `data: ${JSON.stringify({ type: 'metrics', data: metricsData })}`,
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

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      // onMetrics を渡さなくてもエラーにならず、正常にストリームが完了すること
      const result = await aiService.generateStreamResponse('質問')
      expect(result.answer).toBe('回答')
    })

    it('should handle metrics event with m6_timedOut flag', async () => {
      const encoder = new TextEncoder()
      const metricsData: WorkerMetrics = {
        turnId: 'turn-timeout',
        m6: 5000,
        m6_timedOut: true,
      }
      const sseData = [
        `data: ${JSON.stringify({ type: 'chunk', content: 'タイムアウト回答' })}`,
        `data: ${JSON.stringify({ type: 'metrics', data: metricsData })}`,
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

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      const receivedMetrics: WorkerMetrics[] = []
      await aiService.generateStreamResponse(
        '質問',
        undefined,
        { onMetrics: (metrics) => receivedMetrics.push(metrics) },
      )

      expect(receivedMetrics).toHaveLength(1)
      expect(receivedMetrics[0].m6_timedOut).toBe(true)
      expect(receivedMetrics[0].m6).toBe(5000)
    })

    it('should throw on SSE content exceeding max size', async () => {
      const encoder = new TextEncoder()
      // Send many small chunks that accumulate past MAX_CONTENT_SIZE (1MB)
      const chunkSize = 50000 // 50KB per chunk (under 100KB buffer limit)
      const chunkContent = 'x'.repeat(chunkSize)
      const totalChunks = 22 // 22 * 50KB = 1.1MB > 1MB limit

      let readCount = 0
      const reader = {
        read: vi.fn().mockImplementation(async () => {
          if (readCount < totalChunks) {
            readCount++
            const sseData = `data: ${JSON.stringify({ type: 'chunk', content: chunkContent })}\n`
            return { done: false, value: encoder.encode(sseData) }
          }
          return { done: true, value: undefined }
        }),
        releaseLock: vi.fn(),
      }

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      await expect(
        aiService.generateStreamResponse('質問')
      ).rejects.toThrow('SSE content exceeds maximum size')
    })

    it('should throw on SSE buffer overflow from malformed stream', async () => {
      const encoder = new TextEncoder()
      // Create data without newlines larger than MAX_BUFFER_SIZE (100KB)
      const hugeBuffer = 'a'.repeat(100 * 1024 + 1)

      let readCount = 0
      const reader = {
        read: vi.fn().mockImplementation(async () => {
          if (readCount === 0) {
            readCount++
            return { done: false, value: encoder.encode(hugeBuffer) }
          }
          return { done: true, value: undefined }
        }),
        releaseLock: vi.fn(),
      }

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      await expect(
        aiService.generateStreamResponse('質問')
      ).rejects.toThrow('SSE buffer overflow')
    })

    it('should forward abort signal to authenticatedFetch', async () => {
      const controller = new AbortController()
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('回答'))

      await aiService.generateStreamResponse(
        '質問',
        undefined,
        undefined,
        controller.signal,
      )

      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ signal: controller.signal })
      )
    })

    it('should skip malformed JSON in SSE gracefully', async () => {
      const encoder = new TextEncoder()
      const sseData = [
        'data: not-json',
        `data: ${JSON.stringify({ type: 'chunk', content: '有効なチャンク' })}`,
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

      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        body: { getReader: () => reader },
      })

      const result = await aiService.generateStreamResponse('質問')
      expect(result.answer).toBe('有効なチャンク')
    })

    describe('done event with responseId', () => {
      it('done イベントから responseId を受け取って onDone コールバックに渡す', async () => {
        const encoder = new TextEncoder()
        const sseData = [
          `data: ${JSON.stringify({ type: 'chunk', content: '回答テキスト' })}`,
          `data: ${JSON.stringify({ type: 'done', tokensUsed: 100, responseId: 'resp_abc123' })}`,
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

        mockAuthenticatedFetch.mockResolvedValue({
          ok: true,
          body: { getReader: () => reader },
        })

        const receivedDone: DoneData[] = []
        await aiService.generateStreamResponse(
          '質問',
          undefined,
          { onDone: (doneData) => receivedDone.push(doneData) },
        )

        expect(receivedDone).toHaveLength(1)
        expect(receivedDone[0].responseId).toBe('resp_abc123')
        expect(receivedDone[0].totalTokensUsed).toBe(100)
      })

      it('responseId がない done イベントでも正常動作する（後方互換）', async () => {
        const encoder = new TextEncoder()
        const sseData = [
          `data: ${JSON.stringify({ type: 'chunk', content: '回答テキスト' })}`,
          `data: ${JSON.stringify({ type: 'done', tokensUsed: 50 })}`,
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

        mockAuthenticatedFetch.mockResolvedValue({
          ok: true,
          body: { getReader: () => reader },
        })

        const receivedDone: DoneData[] = []
        await aiService.generateStreamResponse(
          '質問',
          undefined,
          { onDone: (doneData) => receivedDone.push(doneData) },
        )

        expect(receivedDone).toHaveLength(1)
        expect(receivedDone[0].responseId).toBeNull()
        expect(receivedDone[0].totalTokensUsed).toBe(50)
      })

      it('tokensUsed もない done イベントでもデフォルト値で正常動作する', async () => {
        const encoder = new TextEncoder()
        const sseData = [
          `data: ${JSON.stringify({ type: 'chunk', content: '回答' })}`,
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

        mockAuthenticatedFetch.mockResolvedValue({
          ok: true,
          body: { getReader: () => reader },
        })

        const receivedDone: DoneData[] = []
        await aiService.generateStreamResponse(
          '質問',
          undefined,
          { onDone: (doneData) => receivedDone.push(doneData) },
        )

        expect(receivedDone).toHaveLength(1)
        expect(receivedDone[0].responseId).toBeNull()
        expect(receivedDone[0].totalTokensUsed).toBe(0)
      })

      it('onDone コールバックがない場合でも done イベントでエラーにならない', async () => {
        const encoder = new TextEncoder()
        const sseData = [
          `data: ${JSON.stringify({ type: 'chunk', content: '回答' })}`,
          `data: ${JSON.stringify({ type: 'done', tokensUsed: 100, responseId: 'resp_xyz' })}`,
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

        mockAuthenticatedFetch.mockResolvedValue({
          ok: true,
          body: { getReader: () => reader },
        })

        // onDone を渡さなくてもエラーにならない
        const result = await aiService.generateStreamResponse('質問')
        expect(result.answer).toBe('回答')
      })
    })

    describe('previousResponseId and storeEnabled options', () => {
      it('previousResponseId をリクエストボディに含める', async () => {
        mockAuthenticatedFetch.mockResolvedValue(
          createSSEResponse('回答')
        )

        await aiService.generateStreamResponse(
          '質問',
          'コンテキスト',
          undefined,
          undefined,
          { previousResponseId: 'resp_prev123' },
        )

        const callBody = JSON.parse(
          (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
        )
        expect(callBody.previousResponseId).toBe('resp_prev123')
      })

      it('storeEnabled をリクエストボディに含める', async () => {
        mockAuthenticatedFetch.mockResolvedValue(
          createSSEResponse('回答')
        )

        await aiService.generateStreamResponse(
          '質問',
          'コンテキスト',
          undefined,
          undefined,
          { storeEnabled: true },
        )

        const callBody = JSON.parse(
          (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
        )
        expect(callBody.storeEnabled).toBe(true)
      })

      it('previousResponseId が undefined の場合はリクエストボディに含めない', async () => {
        mockAuthenticatedFetch.mockResolvedValue(
          createSSEResponse('回答')
        )

        await aiService.generateStreamResponse(
          '質問',
          'コンテキスト',
          undefined,
          undefined,
          { maxTokens: 500 },
        )

        const callBody = JSON.parse(
          (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
        )
        expect(callBody).not.toHaveProperty('previousResponseId')
      })

      it('storeEnabled が undefined の場合はリクエストボディに含めない', async () => {
        mockAuthenticatedFetch.mockResolvedValue(
          createSSEResponse('回答')
        )

        await aiService.generateStreamResponse(
          '質問',
          'コンテキスト',
          undefined,
          undefined,
          { maxTokens: 500 },
        )

        const callBody = JSON.parse(
          (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
        )
        expect(callBody).not.toHaveProperty('storeEnabled')
      })
    })
  })

  describe('summarizeTurn', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('should throw if not initialized', async () => {
      const uninitializedService = new AIService()
      await expect(
        uninitializedService.summarizeTurn('', 'Q', 'A')
      ).rejects.toThrow('AI service not initialized')
    })

    it('should summarize a turn successfully', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ summary: '要約テスト' }),
      })

      const result = await aiService.summarizeTurn('前回の要約', '質問', '回答')
      expect(result).toBe('要約テスト')
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/summarize'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('should throw on non-ok response', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Summarize failed' }),
      })

      await expect(
        aiService.summarizeTurn('', 'Q', 'A')
      ).rejects.toThrow('Summarize failed')
    })

    it('should return empty string when no summary in response', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })

      const result = await aiService.summarizeTurn('', 'Q', 'A')
      expect(result).toBe('')
    })
  })

  describe('prefetchContext', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('should throw if not initialized', async () => {
      const uninitializedService = new AIService()
      await expect(uninitializedService.prefetchContext()).rejects.toThrow(
        'AI service not initialized'
      )
    })

    it('should return context on success', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ context: 'ドキュメントコンテキスト' }),
      })

      const result = await aiService.prefetchContext()
      expect(result).toBe('ドキュメントコンテキスト')
    })

    it('should throw on non-ok response', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Prefetch error' }),
      })

      await expect(aiService.prefetchContext()).rejects.toThrow('Prefetch error')
    })

    it('should return empty string when no context', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      })

      const result = await aiService.prefetchContext()
      expect(result).toBe('')
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

  describe('generateStreamResponseV2', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('speculative phase で /api/ai/generate-v2 を呼ぶ', async () => {
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('投機的回答'))

      await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/generate-v2'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('committed phase で /api/ai/generate-v2 を呼ぶ', async () => {
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('確定回答'))

      await aiService.generateStreamResponseV2('質問', undefined, 'committed')

      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/generate-v2'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    it('phase パラメータがリクエストボディに含まれる', async () => {
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('回答'))

      await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      const callBody = JSON.parse(
        (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(callBody.phase).toBe('speculative')
    })

    it('speculativeText が options にある場合リクエストに含まれる', async () => {
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('回答'))

      await aiService.generateStreamResponseV2(
        '質問',
        undefined,
        'committed',
        undefined,
        undefined,
        { speculativeText: '予測テキスト' }
      )

      const callBody = JSON.parse(
        (mockAuthenticatedFetch.mock.calls[0][1] as RequestInit).body as string
      )
      expect(callBody.speculativeText).toBe('予測テキスト')
    })

    it('v2 失敗（5xx）時に v1 へフォールバックする', async () => {
      mockAuthenticatedFetch
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
        .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))

      const result = await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2)
      expect(result.answer).toBe('フォールバック回答')
    })

    it('onChunk コールバックが呼ばれる', async () => {
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('回答テキスト'))

      const chunks: string[] = []
      await aiService.generateStreamResponseV2(
        '質問',
        undefined,
        'speculative',
        { onChunk: (chunk) => chunks.push(chunk) },
      )

      expect(chunks).toContain('回答テキスト')
    })

    it('未初期化時に例外を投げる', async () => {
      const uninitializedService = new AIService()
      await expect(
        uninitializedService.generateStreamResponseV2('質問', undefined, 'speculative')
      ).rejects.toThrow('AI service not initialized')
    })

    it('4xx エラー（クライアントエラー）は v1 フォールバックせず例外を投げる', async () => {
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Usage limit exceeded' }),
      })

      await expect(
        aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      ).rejects.toThrow('Usage limit exceeded')

      // v1 へのフォールバックは発生しない（1回のみ呼ばれる）
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('v2 auto-fallback feature flag', () => {
    beforeEach(() => {
      aiService.initialize({ apiBaseUrl: 'https://api.example.com' })
    })

    it('isV2Available は初期状態で true を返す', () => {
      expect(aiService.isV2Available()).toBe(true)
    })

    it('v2 の 5xx エラーが3回連続で発生すると isV2Available が false になる', async () => {
      // 3回の 5xx エラーをシミュレート（各回で v2 が 5xx → v1 フォールバック）
      for (let i = 0; i < 3; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }

      for (let i = 0; i < 3; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }

      expect(aiService.isV2Available()).toBe(false)
    })

    it('v2 が無効化された後は v2 エンドポイントを呼ばず直接 v1 を呼ぶ', async () => {
      // 3回の 5xx エラーで v2 を無効化
      for (let i = 0; i < 3; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 3; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }
      expect(aiService.isV2Available()).toBe(false)

      // v2 無効化後の呼び出し
      mockAuthenticatedFetch.mockClear()
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('v1回答'))

      await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      // v1 エンドポイント (/api/ai/generate) のみ呼ばれる
      expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1)
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/generate'),
        expect.anything()
      )
      // generate-v2 は呼ばれない
      expect(mockAuthenticatedFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/generate-v2'),
        expect.anything()
      )
    })

    it('v2 成功時にカウンタがリセットされる', async () => {
      // 2回の 5xx エラー（まだ閾値未満）
      for (let i = 0; i < 2; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 2; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }

      // 成功レスポンスでカウンタリセット
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('v2成功回答'))
      await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      // さらに2回の 5xx エラー（リセット後なので閾値未満のまま）
      for (let i = 0; i < 2; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 2; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }

      // まだ有効のはず（リセット後2回しか失敗していない）
      expect(aiService.isV2Available()).toBe(true)
    })

    it('resetV2 で v2 が再有効化される', async () => {
      // 3回の 5xx エラーで v2 を無効化
      for (let i = 0; i < 3; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 3; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }
      expect(aiService.isV2Available()).toBe(false)

      // resetV2 で再有効化
      aiService.resetV2()
      expect(aiService.isV2Available()).toBe(true)
    })

    it('resetV2 後は v2 エンドポイントを再び呼ぶ', async () => {
      // 3回の 5xx エラーで v2 を無効化
      for (let i = 0; i < 3; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 3; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }

      aiService.resetV2()
      mockAuthenticatedFetch.mockClear()
      mockAuthenticatedFetch.mockResolvedValue(createSSEResponse('v2復帰回答'))

      await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      // v2 エンドポイントが呼ばれる
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/ai/generate-v2'),
        expect.anything()
      )
    })

    it('4xx エラーはカウンタを増加させない', async () => {
      // 2回の 5xx エラー
      for (let i = 0; i < 2; i++) {
        mockAuthenticatedFetch
          .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'Server error' }) })
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 2; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }

      // 4xx エラー（カウンタには影響しない）
      mockAuthenticatedFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Rate limit' }),
      })
      await expect(
        aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      ).rejects.toThrow('Rate limit')

      // まだ v2 は有効（5xx は2回のみ）
      expect(aiService.isV2Available()).toBe(true)
    })

    it('unexpected エラーもカウンタを増加させる', async () => {
      // 2回の unexpected エラー
      for (let i = 0; i < 2; i++) {
        mockAuthenticatedFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      }
      for (let i = 0; i < 2; i++) {
        await aiService.generateStreamResponseV2('質問', undefined, 'speculative')
      }

      // 3回目の unexpected エラーで無効化
      mockAuthenticatedFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createSSEResponse('フォールバック回答'))
      await aiService.generateStreamResponseV2('質問', undefined, 'speculative')

      expect(aiService.isV2Available()).toBe(false)
    })
  })
})
