import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'
import { resetRateLimiter } from '../../src/middleware/rate-limit'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const chainMethods = ['select', 'eq', 'single', 'in', 'is']
for (const m of chainMethods) {
  mockChain[m] = vi.fn().mockReturnValue(mockChain)
}
const mockRpc = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue(mockChain),
    rpc: mockRpc,
  }),
}))

vi.mock('../../src/lib/usage', () => ({
  checkUsageLimit: vi.fn().mockResolvedValue({
    allowed: true, used: 100, limit: 500000, remaining: 499900,
  }),
  checkAndReserveUsage: vi.fn().mockResolvedValue({
    allowed: true, used: 100, limit: 500000, remaining: 499900,
  }),
  adjustReservedUsage: vi.fn().mockResolvedValue(undefined),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/openai', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(Array.from({ length: 1536 }, () => 0.1)),
  generateEmbeddings: vi.fn().mockResolvedValue([
    Array.from({ length: 1536 }, () => 0.1),
    Array.from({ length: 1536 }, () => 0.2),
  ]),
  createOpenAIClient: vi.fn().mockImplementation(() => ({
    responses: {
      create: mockOpenAICreate,
    },
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}))

/**
 * Async iterable mock for OpenAI Responses API streaming.
 * Yields response.output_text.delta events then a response.completed event.
 */
function createMockResponsesStream(
  content = 'test response',
  totalTokens = 150,
  responseId = 'resp_mock_123'
) {
  const events = [
    { type: 'response.output_text.delta', delta: content },
    {
      type: 'response.completed',
      response: {
        id: responseId,
        usage: {
          input_tokens: Math.floor(totalTokens * 0.6),
          output_tokens: Math.floor(totalTokens * 0.4),
          total_tokens: totalTokens,
        },
      },
    },
  ]
  return {
    [Symbol.asyncIterator]: () => {
      let idx = 0
      return {
        async next() {
          if (idx < events.length) {
            return { value: events[idx++], done: false }
          }
          return { value: undefined, done: true }
        },
      }
    },
  }
}

const mockOpenAICreate = vi.fn().mockImplementation(() => createMockResponsesStream())

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    responses: {
      create: mockOpenAICreate,
    },
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}))

import aiRoutes from '../../src/routes/ai'
import { checkAndReserveUsage } from '../../src/lib/usage'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  OPENAI_API_KEY: 'test-openai-key',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
} as Env

async function createAuthHeaders(extraHeaders: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: 'user-123' },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}`, ...extraHeaders }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/ai', aiRoutes)
  return app
}

/**
 * Parse SSE text body into individual event data objects.
 */
function parseSSEEvents(body: string): unknown[] {
  const events: unknown[] = []
  const lines = body.split('\n')
  for (const line of lines) {
    if (line.startsWith('data:')) {
      const raw = line.slice('data:'.length).trim()
      try {
        events.push(JSON.parse(raw))
      } catch {
        // Non-JSON data lines are ignored
      }
    }
  }
  return events
}

describe('POST /api/ai/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiter()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockOpenAICreate.mockImplementation(() => createMockResponsesStream())
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(401)
  })

  it('rejects missing question', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('question')
  })

  it('rejects empty question', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '   ' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('rejects question exceeding max length', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'a'.repeat(2001) }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('returns 429 when AI token limit exceeded', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValueOnce({
      allowed: false, used: 500000, limit: 500000, remaining: 0,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(429)
  })

  // --- Phase 1-3: Cascading dead code removal ---

  it('ignores cascading field in request body (dead code removed)', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', cascading: true }),
      },
      TEST_ENV
    )
    // Should return 200 SSE stream, not crash
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    // Should NOT contain any 'phase' events (cascading was removed)
    const phaseEvents = events.filter((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'phase'
    )
    expect(phaseEvents).toHaveLength(0)

    // OpenAI create should be called exactly once (no cascading quick call)
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
  })

  // --- Phase 0-3: Metrics SSE event ---

  it('emits metrics SSE event with M4-M9 measurement points', async () => {
    const app = createApp()
    const headers = await createAuthHeaders({ 'X-Turn-Id': 'abc1def2-ab12-4c12-8d12-abcdef123456' })
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    // Find the metrics event
    const metricsEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'metrics'
    ) as Record<string, unknown> | undefined

    expect(metricsEvent).toBeDefined()
    expect(metricsEvent!.type).toBe('metrics')

    const data = metricsEvent!.data as Record<string, unknown>
    expect(data.turnId).toBe('abc1def2-ab12-4c12-8d12-abcdef123456')
    expect(typeof data.m4).toBe('number')  // workerReceived
    expect(typeof data.m5).toBe('number')  // usageCompleted
    expect(typeof data.m6).toBe('number')  // ragCompleted
    expect(typeof data.m6_timedOut).toBe('boolean')  // RAG timeout flag
    expect(typeof data.m7).toBe('number')  // openaiCalled
    expect(typeof data.m8).toBe('number')  // openaiFirstChunk
    expect(typeof data.m9).toBe('number')  // sseSent

    // Timestamps should be in ascending order
    expect(data.m4).toBeLessThanOrEqual(data.m5 as number)
    expect(data.m5).toBeLessThanOrEqual(data.m6 as number)
    expect(data.m6).toBeLessThanOrEqual(data.m7 as number)
    expect(data.m7).toBeLessThanOrEqual(data.m8 as number)
    expect(data.m8).toBeLessThanOrEqual(data.m9 as number)
  })

  it('uses "unknown" as turnId when X-Turn-Id header is absent', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    const metricsEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'metrics'
    ) as Record<string, unknown> | undefined

    expect(metricsEvent).toBeDefined()
    const data = metricsEvent!.data as Record<string, unknown>
    expect(data.turnId).toBe('unknown')
  })

  it('emits metrics event only once even with multiple chunks', async () => {
    mockOpenAICreate.mockImplementation(() => {
      const events = [
        { type: 'response.output_text.delta', delta: 'chunk1 ' },
        { type: 'response.output_text.delta', delta: 'chunk2 ' },
        { type: 'response.output_text.delta', delta: 'chunk3' },
        {
          type: 'response.completed',
          response: {
            id: 'resp_multi_chunk',
            usage: { input_tokens: 120, output_tokens: 80, total_tokens: 200 },
          },
        },
      ]
      return {
        [Symbol.asyncIterator]: () => {
          let idx = 0
          return {
            async next() {
              if (idx < events.length) {
                return { value: events[idx++], done: false }
              }
              return { value: undefined, done: true }
            },
          }
        },
      }
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    // metrics event should appear exactly once
    const metricsEvents = events.filter((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'metrics'
    )
    expect(metricsEvents).toHaveLength(1)

    // All content chunks should still be present
    const chunkEvents = events.filter((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'chunk'
    )
    expect(chunkEvents.length).toBeGreaterThanOrEqual(3)
  })

  // --- Phase 1-5: RAG soft deadline ---

  it('completes successfully even when RAG context is empty (soft deadline fallback)', async () => {
    // RAG returns no matches
    mockRpc.mockResolvedValue({ data: [], error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', includeDocumentContext: true }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    // Should have chunk + done events (no error)
    const doneEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'done'
    )
    expect(doneEvent).toBeDefined()
  })

  // --- Phase 1.5-1: Responses API migration ---

  it('done event contains responseId from Responses API', async () => {
    mockOpenAICreate.mockImplementation(() =>
      createMockResponsesStream('test', 150, 'resp_test_abc')
    )

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    const doneEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'done'
    ) as Record<string, unknown> | undefined

    expect(doneEvent).toBeDefined()
    expect(doneEvent!.responseId).toBe('resp_test_abc')
    expect(typeof doneEvent!.tokensUsed).toBe('number')
  })

  it('always calls OpenAI with store: false (fixed)', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.store).toBe(false)
    // previousResponseId は送信されない
    expect(callArgs.previous_response_id).toBeUndefined()

    const body = await res.text()
    const events = parseSSEEvents(body)

    // Should still have chunk and done events
    const chunkEvents = events.filter((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'chunk'
    )
    expect(chunkEvents.length).toBeGreaterThanOrEqual(1)

    const doneEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'done'
    ) as Record<string, unknown> | undefined
    expect(doneEvent).toBeDefined()
    expect(typeof doneEvent!.tokensUsed).toBe('number')
    expect(doneEvent!.responseId).toBeDefined()
  })

  it('uses Responses API with instructions field instead of messages', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    // Responses API uses 'instructions' instead of system message in 'messages'
    expect(callArgs.instructions).toBeDefined()
    expect(typeof callArgs.instructions).toBe('string')
    // Responses API uses 'input' instead of 'messages'
    expect(callArgs.input).toBeDefined()
    // Should NOT have 'messages' (that's Chat Completions API)
    expect(callArgs.messages).toBeUndefined()
  })

  it('uses max_output_tokens instead of max_completion_tokens', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    // Responses API uses max_output_tokens
    expect(callArgs.max_output_tokens).toBeDefined()
    expect(typeof callArgs.max_output_tokens).toBe('number')
    // Should NOT have max_completion_tokens (that's Chat Completions API)
    expect(callArgs.max_completion_tokens).toBeUndefined()
  })

  it('handles response.failed event gracefully', async () => {
    mockOpenAICreate.mockImplementation(() => {
      const events = [
        {
          type: 'response.failed',
          response: {
            id: 'resp_failed',
            error: { message: 'Internal error' },
            usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
          },
        },
      ]
      return {
        [Symbol.asyncIterator]: () => {
          let idx = 0
          return {
            async next() {
              if (idx < events.length) {
                return { value: events[idx++], done: false }
              }
              return { value: undefined, done: true }
            },
          }
        },
      }
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    // Should have an error event in SSE
    const errorEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'error'
    )
    expect(errorEvent).toBeDefined()
  })

  it('SSE stream contains done event with tokensUsed', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    const doneEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'done'
    ) as Record<string, unknown> | undefined

    expect(doneEvent).toBeDefined()
    expect(typeof doneEvent!.tokensUsed).toBe('number')
  })

  it('skips RAG embedding when includeDocumentContext is false', async () => {
    const { generateEmbedding } = await import('../../src/lib/openai')

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', includeDocumentContext: false }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    // generateEmbedding should NOT be called when RAG is disabled
    expect(generateEmbedding).not.toHaveBeenCalled()
  })

  it('sanitizes invalid X-Turn-Id to "unknown"', async () => {
    const app = createApp()
    const headers = await createAuthHeaders({
      'X-Turn-Id': '../../malicious-path<script>',
    })
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)

    const metricsEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'metrics'
    ) as Record<string, unknown> | undefined

    expect(metricsEvent).toBeDefined()
    const data = metricsEvent!.data as Record<string, unknown>
    // Invalid turn ID should be sanitized to 'unknown'
    expect(data.turnId).toBe('unknown')
  })

  it('accepts gpt-5.4-nano as a valid model', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', model: 'gpt-5.4-nano' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-5.4-nano')
    // gpt-5.4-nano should have reasoning and no temperature
    expect(callArgs.reasoning).toBeDefined()
    expect(callArgs.temperature).toBeUndefined()
  })

  it('gpt-5.4-nano (COMMITTED_MODEL) uses reasoning effort "none" in v1 generate', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', model: 'gpt-5.4-nano' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.reasoning).toEqual({ effort: 'none' })
  })

  it('gpt-5-nano uses reasoning effort "minimal" in v1 generate', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', model: 'gpt-5-nano' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.reasoning).toEqual({ effort: 'minimal' })
  })
})

describe('POST /api/ai/summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiter()
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true, used: 100, limit: 500000, remaining: 499900,
    })
  })

  it('rejects missing interviewer', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/summarize',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidate: 'test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('rejects missing candidate', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/summarize',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ interviewer: 'test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('returns summary on valid request (without previousSummary)', async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: '要約結果テキスト' } }],
      usage: { total_tokens: 80 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/summarize',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewer: '面接官の質問',
          candidate: '候補者の回答',
        }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary).toBe('要約結果テキスト')
  })

  it('includes previousSummary in prompt when provided', async () => {
    mockOpenAICreate.mockResolvedValueOnce({
      choices: [{ message: { content: '更新された要約' } }],
      usage: { total_tokens: 100 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/summarize',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewer: '面接官の質問',
          candidate: '候補者の回答',
          previousSummary: '前回の要約テキスト',
        }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary).toBe('更新された要約')

    // previousSummary が OpenAI への messages に含まれていることを確認
    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    const userMessage = callArgs.messages?.[1]?.content ?? ''
    expect(userMessage).toContain('前回の要約テキスト')
  })
})

describe('POST /api/ai/embeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiter()
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true, used: 100, limit: 500000, remaining: 499900,
    })
  })

  it('rejects missing text/texts', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/embeddings',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('text or texts')
  })

  it('rejects empty text', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/embeddings',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('rejects texts exceeding max count', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/embeddings',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: Array.from({ length: 21 }, (_, i) => `text ${i}`) }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('returns embedding for single text', async () => {
    const { generateEmbedding } = await import('../../src/lib/openai')
    vi.mocked(generateEmbedding).mockResolvedValueOnce(Array.from({ length: 1536 }, () => 0.5))

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/embeddings',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'テスト文章' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.embeddings)).toBe(true)
    expect(body.embeddings).toHaveLength(1)
    expect(body.embeddings[0]).toHaveLength(1536)
  })

  it('returns embeddings for multiple texts', async () => {
    const { generateEmbeddings } = await import('../../src/lib/openai')
    vi.mocked(generateEmbeddings).mockResolvedValueOnce([
      Array.from({ length: 1536 }, () => 0.1),
      Array.from({ length: 1536 }, () => 0.2),
    ])

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/embeddings',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: ['テキスト1', 'テキスト2'] }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.embeddings).toHaveLength(2)
  })
})

describe('POST /api/ai/generate-v2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiter()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockOpenAICreate.mockImplementation(() => createMockResponsesStream())
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when phase is missing', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('phase')
  })

  it('returns 400 when phase is invalid', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test', phase: 'invalid' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when question is missing', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('question')
  })

  it('returns 429 when usage limit exceeded', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValueOnce({
      allowed: false, used: 500000, limit: 500000, remaining: 0,
    })
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(429)
  })

  it('speculative phase uses gpt-5-nano with max_output_tokens <= 500', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-5-nano')
    expect(callArgs.max_output_tokens).toBeLessThanOrEqual(500)
  })

  it('committed phase uses gpt-5.4-nano with max_output_tokens >= 800', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'committed' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    expect(mockOpenAICreate).toHaveBeenCalledTimes(1)
    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-5.4-nano')
    expect(callArgs.max_output_tokens).toBeGreaterThanOrEqual(800)
  })

  it('committed phase (gpt-5.4-nano) uses reasoning effort "none"', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'committed' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-5.4-nano')
    expect(callArgs.reasoning).toEqual({ effort: 'none' })
  })

  it('speculative phase (gpt-5-nano) uses reasoning effort "minimal"', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.model).toBe('gpt-5-nano')
    expect(callArgs.reasoning).toEqual({ effort: 'minimal' })
  })

  it('committed phase with speculativeText does NOT add prediction (Responses API unsupported)', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'test question',
          phase: 'committed',
          speculativeText: '予測テキスト',
        }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.prediction).toBeUndefined()
  })

  it('committed phase without speculativeText has no prediction', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'committed' }),
      },
      TEST_ENV
    )

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.prediction).toBeUndefined()
  })

  it('speculative phase skips RAG (generateEmbedding not called)', async () => {
    const { generateEmbedding } = await import('../../src/lib/openai')
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(generateEmbedding).not.toHaveBeenCalled()
  })

  it('committed phase does not pass previous_response_id (store: false fixed)', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: 'test question',
          phase: 'committed',
        }),
      },
      TEST_ENV
    )

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.previous_response_id).toBeUndefined()
    expect(callArgs.store).toBe(false)
  })

  it('done event contains responseId', async () => {
    mockOpenAICreate.mockImplementation(() =>
      createMockResponsesStream('test', 150, 'resp_v2_test')
    )
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)

    const body = await res.text()
    const events = parseSSEEvents(body)
    const doneEvent = events.find((e: unknown) =>
      typeof e === 'object' && e !== null && (e as Record<string, unknown>).type === 'done'
    ) as Record<string, unknown> | undefined
    expect(doneEvent).toBeDefined()
    expect(doneEvent!.responseId).toBe('resp_v2_test')
  })

  it('SSE response has correct Content-Encoding: identity header (direct ReadableStream)', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'speculative' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Content-Encoding')).toBe('identity')
    expect(res.headers.get('X-Accel-Buffering')).toBe('no')
    expect(res.headers.get('Cache-Control')).toBe('no-cache, no-transform')
  })

  it('speculative phase uses SPECULATIVE_SYSTEM_PROMPT in instructions', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    await app.request(
      '/api/ai/generate-v2',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: 'test question', phase: 'speculative' }),
      },
      TEST_ENV
    )

    const callArgs = mockOpenAICreate.mock.calls[0][0]
    expect(callArgs.instructions).toContain('方向性')
  })
})

describe('POST /api/ai/prefetch-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetRateLimiter()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns empty context when no documents', async () => {
    mockChain.in = vi.fn().mockResolvedValueOnce({ data: [], error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/ai/prefetch-context',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.context).toBe('')
  })
})
