import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'
const TEST_USER_ID = 'user-123'

// --- Mock setup (same pattern as questions.test.ts) ---

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'single', 'is', 'order', 'in', 'limit']
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
  checkUsageLimit: vi.fn(),
  checkAndReserveUsage: vi.fn(),
  adjustReservedUsage: vi.fn(),
  recordUsage: vi.fn(),
}))

vi.mock('../../src/lib/openai', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
  createOpenAIClient: vi.fn().mockReturnValue({
    responses: {
      create: vi.fn(),
    },
  }),
}))

vi.mock('../../src/lib/embedding-cache', () => ({
  invalidateEmbeddingCache: vi.fn().mockResolvedValue(true),
  invalidateEmbeddingCacheBatch: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/profile', () => ({
  formatProfileContext: vi.fn().mockReturnValue('氏名: テスト太郎\n現職: テスト株式会社'),
}))

vi.mock('../../src/lib/profile-cache', () => ({
  getCachedProfile: vi.fn().mockResolvedValue({ fullName: 'テスト太郎' }),
  invalidateProfileCache: vi.fn().mockResolvedValue(undefined),
}))

import questionsRoutes from '../../src/routes/questions'
import { checkAndReserveUsage, adjustReservedUsage, recordUsage } from '../../src/lib/usage'
import { createOpenAIClient } from '../../src/lib/openai'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  OPENAI_API_KEY: 'test-openai-key',
} as Env

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: TEST_USER_ID },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/questions', questionsRoutes)
  return app
}

function resetMocks() {
  vi.clearAllMocks()
  for (const m of chainMethods) {
    mockChain[m] = vi.fn().mockReturnValue(mockChain)
  }
}

/**
 * Create a mock async iterable that simulates OpenAI streaming responses.
 */
function createMockOpenAIStream(events: Array<{ type: string; delta?: string; response?: Record<string, unknown> }>) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        yield event
      }
    },
  }
}

// --- Tests: POST /api/questions/generate ---

describe('POST /api/questions/generate', () => {
  beforeEach(resetMocks)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
    }, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no resume documents exist', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 500000,
      remaining: 500000,
    })

    // documents query returns empty
    mockChain.is = vi.fn().mockResolvedValue({ data: [], error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('履歴書')

    // Should release reservation
    expect(adjustReservedUsage).toHaveBeenCalled()
  })

  it('returns 429 when AI token limit exceeded', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: false,
      used: 500000,
      limit: 500000,
      remaining: 0,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns SSE response with correct headers', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 500000,
      remaining: 500000,
    })

    // Resume documents exist
    mockChain.is = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null })
    // Document chunks
    mockChain.order = vi.fn().mockResolvedValue({ data: [{ content: '履歴書の内容' }], error: null })

    const mockStream = createMockOpenAIStream([
      { type: 'response.completed', response: { usage: { total_tokens: 100 } } },
    ])
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(mockStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')
    expect(res.headers.get('Cache-Control')).toContain('no-cache')
  })

  it('streams generated questions', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 500000,
      remaining: 500000,
    })

    // Resume documents exist
    mockChain.is = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null })
    // Document chunks
    mockChain.order = vi.fn().mockResolvedValue({ data: [{ content: '履歴書の内容' }], error: null })

    const questionData = '<question>{"question": "自己紹介してください", "answer": "テスト太郎です"}</question>'
    const mockStream = createMockOpenAIStream([
      { type: 'response.output_text.delta', delta: questionData },
      { type: 'response.completed', response: { usage: { total_tokens: 500 } } },
    ])
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(mockStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(200)

    const text = await res.text()
    // SSE format: data: ...\n\n
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))
    expect(lines.length).toBeGreaterThanOrEqual(2) // question + done

    const questionEvent = JSON.parse(lines[0].replace('data: ', ''))
    expect(questionEvent.type).toBe('question')
    expect(questionEvent.data.index).toBe(0)
    expect(questionEvent.data.question).toBe('自己紹介してください')
    expect(questionEvent.data.answer).toBe('テスト太郎です')

    const doneEvent = JSON.parse(lines[lines.length - 1].replace('data: ', ''))
    expect(doneEvent.type).toBe('done')
    expect(doneEvent.data.total).toBe(1)
    expect(doneEvent.data.tokens).toBe(500)
  })

  it('sends SSE error event when OpenAI stream throws', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true, used: 0, limit: 500000, remaining: 500000,
    })

    // Resume documents exist
    mockChain.is = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null })
    mockChain.order = vi.fn().mockResolvedValue({ data: [{ content: '履歴書の内容' }], error: null })

    // OpenAI stream throws mid-stream
    const errorStream = {
      async *[Symbol.asyncIterator]() {
        throw new Error('OpenAI API error')
      },
    }
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(errorStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(200) // SSE always returns 200
    const text = await res.text()
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))
    expect(lines.length).toBeGreaterThanOrEqual(1)

    const errorEvent = JSON.parse(lines[0].replace('data: ', ''))
    expect(errorEvent.type).toBe('error')
    expect(errorEvent.data.message).toBeTruthy()

    // Usage reservation should be released
    expect(adjustReservedUsage).toHaveBeenCalled()
  })

  it('skips malformed JSON in question tags and continues', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true, used: 0, limit: 500000, remaining: 500000,
    })

    mockChain.is = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null })
    mockChain.order = vi.fn().mockResolvedValue({ data: [{ content: '履歴書' }], error: null })

    // First question has broken JSON, second is valid
    const mixedData = '<question>{"broken json</question><question>{"question": "有効な質問", "answer": "有効な回答"}</question>'
    const mockStream = createMockOpenAIStream([
      { type: 'response.output_text.delta', delta: mixedData },
      { type: 'response.completed', response: { usage: { total_tokens: 300 } } },
    ])
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(mockStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const text = await res.text()
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))

    // Should have at least: valid question + done
    const events = lines.map(l => JSON.parse(l.replace('data: ', '')))
    const questionEvents = events.filter(e => e.type === 'question')
    const doneEvents = events.filter(e => e.type === 'done')

    expect(questionEvents).toHaveLength(1)
    expect(questionEvents[0].data.question).toBe('有効な質問')
    expect(doneEvents).toHaveLength(1)
    expect(doneEvents[0].data.total).toBe(1)
  })

  it('records usage after successful generation', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true, used: 0, limit: 500000, remaining: 500000,
    })

    mockChain.is = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null })
    mockChain.order = vi.fn().mockResolvedValue({ data: [{ content: '履歴書' }], error: null })

    const mockStream = createMockOpenAIStream([
      { type: 'response.output_text.delta', delta: '<question>{"question": "Q1", "answer": "A1"}</question>' },
      { type: 'response.completed', response: { usage: { total_tokens: 750 } } },
    ])
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(mockStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(200)
    await res.text() // consume response

    // adjustReservedUsageが実使用量で呼ばれること
    expect(adjustReservedUsage).toHaveBeenCalled()
    // recordUsageが呼ばれること
    expect(recordUsage).toHaveBeenCalled()
  })
})

// --- Tests: POST /api/questions/answer ---

describe('POST /api/questions/answer', () => {
  beforeEach(resetMocks)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/questions/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'テスト' }),
    }, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns 400 when question is missing', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/answer', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('question')
  })

  it('returns 400 when question exceeds max length', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/answer', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Q'.repeat(501) }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('500')
  })

  it('returns 429 when AI token limit exceeded', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: false,
      used: 500000,
      limit: 500000,
      remaining: 0,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/answer', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '自己紹介してください' }),
    }, TEST_ENV)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns SSE response for answer generation', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 500000,
      remaining: 500000,
    })

    // Resume documents exist
    mockChain.is = vi.fn().mockResolvedValue({ data: [{ id: 'doc-1' }], error: null })
    // Document chunks
    mockChain.order = vi.fn().mockResolvedValue({ data: [{ content: '履歴書の内容' }], error: null })

    const mockStream = createMockOpenAIStream([
      { type: 'response.output_text.delta', delta: 'テスト太郎です。' },
      { type: 'response.output_text.delta', delta: '現在テスト株式会社に勤務しています。' },
      { type: 'response.completed', response: { usage: { total_tokens: 200 } } },
    ])
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(mockStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/answer', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '自己紹介してください' }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const text = await res.text()
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))
    expect(lines.length).toBeGreaterThanOrEqual(3) // 2 chunks + done

    const chunk1 = JSON.parse(lines[0].replace('data: ', ''))
    expect(chunk1.type).toBe('chunk')
    expect(chunk1.content).toBe('テスト太郎です。')

    const chunk2 = JSON.parse(lines[1].replace('data: ', ''))
    expect(chunk2.type).toBe('chunk')
    expect(chunk2.content).toBe('現在テスト株式会社に勤務しています。')

    const doneEvent = JSON.parse(lines[lines.length - 1].replace('data: ', ''))
    expect(doneEvent.type).toBe('done')
    expect(doneEvent.data.tokens).toBe(200)
  })

  it('generates answer without resume documents', async () => {
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true, used: 0, limit: 500000, remaining: 500000,
    })

    // No resume documents
    mockChain.is = vi.fn().mockResolvedValue({ data: [], error: null })

    const mockStream = createMockOpenAIStream([
      { type: 'response.output_text.delta', delta: '回答テキストです。' },
      { type: 'response.completed', response: { usage: { total_tokens: 100 } } },
    ])
    vi.mocked(createOpenAIClient).mockReturnValue({
      responses: {
        create: vi.fn().mockResolvedValue(mockStream),
      },
    } as unknown as ReturnType<typeof createOpenAIClient>)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/answer', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '自己紹介してください' }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const text = await res.text()
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))
    const events = lines.map(l => JSON.parse(l.replace('data: ', '')))

    expect(events.some(e => e.type === 'chunk')).toBe(true)
    expect(events.some(e => e.type === 'done')).toBe(true)
  })
})
