import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

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
}))

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: 'テスト回答' }, finish_reason: 'stop' }],
          usage: { total_tokens: 150 },
        }),
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

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: 'user-123', email: 'test@example.com', name: 'Test', picture: '' },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/ai', aiRoutes)
  return app
}

describe('POST /api/ai/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
    mockChain.single = vi.fn().mockResolvedValue({
      data: { interview_profile: null },
      error: null,
    })
    mockRpc.mockResolvedValue({ data: [], error: null })
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
        body: JSON.stringify({ question: 'テスト質問' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(429)
  })
})

describe('POST /api/ai/summarize', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})

describe('POST /api/ai/embeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})

describe('POST /api/ai/prefetch-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
