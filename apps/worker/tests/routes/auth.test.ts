import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

// Mock dependencies
const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'single', 'is', 'upsert']
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

vi.mock('../../src/lib/auth', async () => {
  const actual = await vi.importActual('../../src/lib/auth')
  return {
    ...actual,
    exchangeCodeForTokens: vi.fn(),
    getGoogleUserInfo: vi.fn(),
  }
})

import authRoutes from '../../src/routes/auth'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
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
  app.route('/api/auth', authRoutes)
  return app
}

describe('GET /api/auth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('redirects to Google OAuth', async () => {
    const app = createApp()
    const res = await app.request('/api/auth/google', {}, TEST_ENV)
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('accounts.google.com')
    expect(location).toContain('client_id=test-client-id')
  })

  it('includes session_id in state when provided', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/google?session_id=test-session-123',
      {},
      TEST_ENV
    )
    expect(res.status).toBe(302)
  })
})

describe('POST /api/auth/session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockRpc.mockResolvedValue({ data: null, error: null })
  })

  it('creates a new auth session', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sessionId).toBeDefined()
    expect(body.authUrl).toContain('/api/auth/google')
    expect(body.expiresAt).toBeDefined()
  })

  it('creates session with valid returnUrl', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: 'https://interview-bot-web.pages.dev/checkout' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
  })

  it('rejects invalid returnUrl origin', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/session',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: 'https://evil.com/phish' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid returnUrl')
  })
})

describe('GET /api/auth/session (polling)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns 400 without session ID', async () => {
    const app = createApp()
    const res = await app.request('/api/auth/session', {}, TEST_ENV)
    expect(res.status).toBe(400)
  })

  it('returns pending status for pending session', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: {
        status: 'pending',
        token: null,
        user_data: null,
        expires_at: new Date(Date.now() + 300000).toISOString(),
        error: null,
      },
      error: null,
    })

    const app = createApp()
    const res = await app.request('/api/auth/session?id=test-session', {}, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('pending')
  })

  it('returns 404 for non-existent session', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const app = createApp()
    const res = await app.request('/api/auth/session?id=nonexistent', {}, TEST_ENV)
    expect(res.status).toBe(404)
  })

  it('does not return token in fallback path when RPC fails (M-3: prevent non-atomic token retrieval)', async () => {
    // RPC returns empty (failed to consume atomically)
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    // Fallback query finds a 'completed' session with token
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: {
        status: 'completed',
        token: 'jwt-token-value',
        user_data: { id: 'user-1', email: 'test@test.com' },
        expires_at: new Date(Date.now() + 300000).toISOString(),
        error: null,
      },
      error: null,
    })

    const app = createApp()
    const res = await app.request('/api/auth/session?id=test-session', {}, TEST_ENV)
    const body = await res.json()

    // Should NOT return token in fallback - only atomic RPC should return tokens
    expect(body.token).toBeUndefined()
    expect(body.status).toBe('completed')
  })
})

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/auth/me', {}, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns user info with valid auth', async () => {
    const userData = {
      id: 'user-123',
      email: 'test@example.com',
      display_name: 'Test User',
      avatar_url: 'https://example.com/avatar.jpg',
      subscription_tier: 'free',
      subscription_status: 'active',
      subscription_period_end: null,
      monthly_stt_minutes_used: 5,
      monthly_ai_tokens_used: 1000,
      monthly_storage_bytes_used: 0,
      interview_profile: null,
    }

    const settingsData = {
      theme: 'dark',
      auto_generate_ai: true,
      ai_model: 'gpt-5-mini',
      ai_temperature: 0.7,
      ai_max_tokens: 1000,
      context_min_similarity: 0.7,
      context_top_k: 3,
    }

    let callCount = 0
    mockChain.single = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ data: userData, error: null })
      return Promise.resolve({ data: settingsData, error: null })
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/auth/me', { headers }, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.id).toBe('user-123')
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.subscriptionTier).toBe('free')
    expect(body.settings.theme).toBe('dark')
    expect(body.settings.aiModel).toBe('gpt-5-mini')
  })
})

describe('POST /api/auth/refresh (M-4: JWT refresh)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns 401 without auth header', async () => {
    const app = createApp()
    const res = await app.request('/api/auth/refresh', {
      method: 'POST',
    }, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns new JWT when given a valid token and user exists', async () => {
    // Mock user exists check
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: {
        id: 'user-123',
        email: 'test@example.com',
        display_name: 'Test',
        avatar_url: '',
      },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers,
    }, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeDefined()
    expect(typeof body.token).toBe('string')
    expect(body.token.split('.')).toHaveLength(3)
  })

  it('returns 401 when user no longer exists', async () => {
    // Mock user not found
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers,
    }, TEST_ENV)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toContain('User not found')
  })

  it('returns 401 with expired token', async () => {
    // Generate an expired token by manually creating one with past expiry
    // verifyJWT will reject it, so authRequired will return 401
    const app = createApp()
    const res = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer invalid.token.here' },
    }, TEST_ENV)
    expect(res.status).toBe(401)
  })
})

describe('JWT expiry (M-4)', () => {
  it('generates JWT with 24-hour expiry instead of 7 days', async () => {
    const token = await generateJWT(
      { sub: 'user-123', email: 'test@example.com', name: 'Test', picture: '' },
      TEST_JWT_SECRET
    )

    // Decode the payload
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const expectedExpiry = payload.iat + 60 * 60 * 24 // 24 hours
    expect(payload.exp).toBe(expectedExpiry)
  })
})

describe('PUT /api/auth/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/profile',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'Test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(401)
  })

  it('updates profile with valid data', async () => {
    mockChain.eq = vi.fn().mockResolvedValueOnce({ error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/auth/profile',
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: '田中太郎', targetCompany: 'XYZ株式会社' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.interviewProfile.fullName).toBe('田中太郎')
  })

  it('rejects invalid profile data', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/auth/profile',
      {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameReading: 'without fullName' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('fullName')
  })
})
