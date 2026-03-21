import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'
const TEST_USER_ID = 'user-123'

// Mock chain
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

const mockCreate = vi.fn()

vi.mock('../../src/lib/usage', () => ({
  checkUsageLimit: vi.fn(),
  checkAndReserveUsage: vi.fn(),
  adjustReservedUsage: vi.fn(),
  recordUsage: vi.fn(),
}))

vi.mock('../../src/lib/openai', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2]]),
}))

vi.mock('../../src/lib/profile', () => ({
  formatProfileContext: vi.fn().mockReturnValue('氏名: 田中太郎'),
}))

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  }
})

import questionsRoutes from '../../src/routes/questions'
import { checkAndReserveUsage, adjustReservedUsage, recordUsage } from '../../src/lib/usage'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  OPENAI_API_KEY: 'test-openai-key',
} as Env

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: TEST_USER_ID, email: 'test@example.com', name: 'Test', picture: '' },
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

describe('POST /api/questions/generate - success flow', () => {
  beforeEach(resetMocks)

  it('generates questions and returns answers', async () => {
    // Chunks and profile queries (Promise.all)
    mockChain.in = vi.fn().mockResolvedValue({
      data: [
        { content: 'resume content', documents: { type: 'resume', name: 'resume.pdf' } },
        { content: 'job content', documents: { type: 'job_posting', name: 'job.pdf' } },
      ],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: { fullName: '田中太郎' } },
      error: null,
    })

    // checkAndReserveUsage
    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 1000,
      limit: 30000,
      remaining: 29000,
    })

    // OpenAI completion
    mockCreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            answers: ['自己紹介の回答', '志望動機の回答'],
          }),
          refusal: null,
        },
      }],
      usage: { total_tokens: 5000 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 2 }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.questions).toHaveLength(2)
    expect(body.questions[0].answer).toBe('自己紹介の回答')
    expect(body.tokensUsed).toBe(5000)

    // Verify usage tracking
    expect(adjustReservedUsage).toHaveBeenCalled()
    expect(recordUsage).toHaveBeenCalled()
  })

  it('returns 500 when AI response is truncated', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    mockCreate.mockResolvedValue({
      choices: [{ finish_reason: 'length', message: { content: '{}', refusal: null } }],
      usage: { total_tokens: 10000 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('truncated')
  })

  it('returns 422 when AI refuses to generate', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    mockCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: null, refusal: 'Content policy violation' } }],
      usage: { total_tokens: 100 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(422)
  })

  it('returns 500 when AI returns empty content', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    mockCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: null, refusal: null } }],
      usage: { total_tokens: 0 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('empty')
  })

  it('returns 500 when AI returns invalid JSON', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    mockCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: 'not json', refusal: null } }],
      usage: { total_tokens: 100 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('parse')
  })

  it('returns 500 when AI returns invalid format (no answers array)', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    mockCreate.mockResolvedValue({
      choices: [{ finish_reason: 'stop', message: { content: '{"answers": "not-array"}', refusal: null } }],
      usage: { total_tokens: 100 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Invalid AI response')
  })

  it('skips recordUsage when totalTokensUsed is 0', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    mockCreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({ answers: ['answer1'] }),
          refusal: null,
        },
      }],
      usage: { total_tokens: 0 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1 }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    expect(recordUsage).not.toHaveBeenCalled()
  })

  it('returns 500 when chunks query fails', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'query failed' },
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Failed to fetch')
  })

  it('accepts default count when body is empty object', async () => {
    mockChain.in = vi.fn().mockResolvedValue({
      data: [{ content: 'resume', documents: { type: 'resume', name: 'r.pdf' } }],
      error: null,
    })

    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })

    vi.mocked(checkAndReserveUsage).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30000,
      remaining: 30000,
    })

    const answers = Array.from({ length: 20 }, (_, i) => `answer${i}`)
    mockCreate.mockResolvedValue({
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({ answers }),
          refusal: null,
        },
      }],
      usage: { total_tokens: 8000 },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.questions).toHaveLength(20) // default count
  })

  it('returns 400 for non-integer count', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/questions/generate', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 1.5 }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
  })
})
