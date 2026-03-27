import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

// Mock Supabase
const mockRpc = vi.fn()
const mockFrom = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

// Mock Soniox
vi.mock('../../src/lib/stt-token', () => ({
  generateTemporaryToken: vi.fn().mockResolvedValue({
    token: 'test-soniox-token',
    expiresIn: 600,
  }),
  DEFAULT_STT_CONFIG: {
    model: 'stt-rt-preview',
    audioFormat: 'pcm_s16le',
    sampleRate: 16000,
    numChannels: 1,
    languageHints: ['ja'],
    enableEndpointDetection: true,
  },
}))

// Mock usage
vi.mock('../../src/lib/usage', () => ({
  checkUsageLimit: vi.fn().mockResolvedValue({
    allowed: true,
    used: 10,
    limit: 600,
    remaining: 590,
  }),
  recordUsage: vi.fn().mockResolvedValue(undefined),
}))

import sttRoutes from '../../src/routes/stt'
import { checkUsageLimit } from '../../src/lib/usage'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  SONIOX_API_KEY: 'test-soniox-key',
} as Env

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: 'user-123' },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/stt', sttRoutes)
  return app
}

describe('POST /api/stt/token', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/stt/token', { method: 'POST' }, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns token when usage is within limits', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stt/token',
      { method: 'POST', headers },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.token).toBe('test-soniox-token')
    expect(body.config).toBeDefined()
    expect(body.config.model).toBe('stt-rt-preview')
    expect(body.usage.used).toBe(10)
    expect(body.usage.limit).toBe(600)
  })

  it('returns 429 when usage limit exceeded', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValueOnce({
      allowed: false,
      used: 600,
      limit: 600,
      remaining: 0,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stt/token',
      { method: 'POST', headers },
      TEST_ENV
    )
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toContain('上限')
  })
})

describe('POST /api/stt/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset checkUsageLimit to default after token test
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 15,
      limit: 600,
      remaining: 585,
    })
  })

  it('records valid usage', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stt/usage',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 5.3 }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.recorded).toBe(6) // ceil(5.3)
  })

  it('rejects invalid minutes', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stt/usage',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: -1 }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('rejects minutes exceeding max session', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stt/usage',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 121 }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })

  it('rejects non-number minutes', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stt/usage',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: 'five' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })
})
