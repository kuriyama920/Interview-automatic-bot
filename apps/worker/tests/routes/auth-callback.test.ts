import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

// Mock chain
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

vi.mock('../../src/lib/auth-pages', () => ({
  getSuccessPageHtml: vi.fn().mockReturnValue('<html>Success</html>'),
  getErrorPageHtml: vi.fn().mockReturnValue('<html>Error</html>'),
}))

import authRoutes from '../../src/routes/auth'
import { exchangeCodeForTokens, getGoogleUserInfo } from '../../src/lib/auth'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  GOOGLE_CLIENT_ID: 'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
} as Env

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/auth', authRoutes)
  return app
}

function resetMocks() {
  vi.clearAllMocks()
  for (const m of chainMethods) {
    mockChain[m] = vi.fn().mockReturnValue(mockChain)
  }
}

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: 'user-123' },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

describe('GET /api/auth/callback', () => {
  beforeEach(resetMocks)

  it('redirects with error when OAuth error query param present', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?error=access_denied',
      {},
      TEST_ENV
    )

    // Should redirect to interview-bot:// with error
    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('interview-bot://auth/callback')
    expect(location).toContain('error=')
  })

  it('redirects with error when code or state missing', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/auth/callback',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('error=')
  })

  it('redirects with error when state is invalid/expired', async () => {
    // State lookup returns null (not found)
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?code=test-code&state=invalid-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('error=')
  })

  it('redirects with error when state is expired', async () => {
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: {
        redirect_uri: 'interview-bot://auth/callback',
        session_id: null,
        expires_at: new Date(Date.now() - 60000).toISOString(), // expired
      },
      error: null,
    })

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?code=test-code&state=expired-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('error=')
  })

  it('completes OAuth flow with valid state and redirectUri (deep link sends only status, no token)', async () => {
    // getOAuthState - valid state
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: {
        redirect_uri: 'interview-bot://auth/callback',
        session_id: null,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      },
      error: null,
    })

    // deleteOAuthState chain
    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    // exchangeCodeForTokens
    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'google-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: 'google-id-token',
    })

    // getGoogleUserInfo
    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: 'google-user-123',
      email: 'user@gmail.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/photo.jpg',
    })

    // upsertUser RPC: upsert_user_profile
    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'user-uuid-123',
        email: 'user@gmail.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/photo.jpg',
        subscription_tier: 'free',
      },
      error: null,
    })

    // upsert user_settings
    mockChain.upsert = vi.fn().mockResolvedValue({ error: null })

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?code=auth-code-123&state=valid-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location).toContain('interview-bot://auth/callback')
    // Deep link must NOT contain token or user data (security: no secrets in URL)
    expect(location).not.toContain('token=')
    expect(location).not.toContain('user=')
    // Deep link must contain status=completed
    expect(location).toContain('status=completed')
    // Must have Referrer-Policy
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
  })

  it('generates JWT with only sub claim in callback (no PII)', async () => {
    // getOAuthState - session flow so we can inspect the stored JWT
    mockChain.single = vi.fn()
      .mockResolvedValueOnce({
        data: {
          redirect_uri: null,
          session_id: 'session-jwt-check',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { return_url: null },
        error: null,
      })

    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    // Capture the update call to inspect the stored JWT
    let storedToken: string | undefined
    mockChain.update = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      if (data && typeof data === 'object' && 'token' in data) {
        storedToken = data.token as string
      }
      return mockChain
    })

    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'google-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: 'id-token',
    })

    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: 'google-123',
      email: 'user@gmail.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/photo.jpg',
    })

    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'user-uuid-456',
        email: 'user@gmail.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/photo.jpg',
        subscription_tier: 'free',
      },
      error: null,
    })

    mockChain.upsert = vi.fn().mockResolvedValue({ error: null })

    const app = createApp()
    await app.request(
      '/api/auth/callback?code=auth-code&state=session-state',
      {},
      TEST_ENV
    )

    // Verify the stored JWT contains only sub (no PII)
    expect(storedToken).toBeDefined()
    const payload = JSON.parse(atob(storedToken!.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    expect(payload.sub).toBe('user-uuid-456')
    expect(payload.email).toBeUndefined()
    expect(payload.name).toBeUndefined()
    expect(payload.picture).toBeUndefined()
  })

  it('still stores userData in auth_sessions for session polling flow', async () => {
    // getOAuthState - session flow
    mockChain.single = vi.fn()
      .mockResolvedValueOnce({
        data: {
          redirect_uri: null,
          session_id: 'session-userdata-check',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { return_url: null },
        error: null,
      })

    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    // Capture the update call to inspect stored user_data
    let storedUserData: Record<string, unknown> | undefined
    let storedJwt: string | undefined
    mockChain.update = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      if (data && typeof data === 'object' && 'user_data' in data) {
        storedUserData = data.user_data as Record<string, unknown>
        storedJwt = data.token as string
      }
      return mockChain
    })

    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'google-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: 'id-token',
    })

    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: 'google-123',
      email: 'user@gmail.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/photo.jpg',
    })

    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'user-uuid-789',
        email: 'user@gmail.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/photo.jpg',
        subscription_tier: 'pro',
      },
      error: null,
    })

    mockChain.upsert = vi.fn().mockResolvedValue({ error: null })

    const app = createApp()
    await app.request(
      '/api/auth/callback?code=auth-code&state=session-state',
      {},
      TEST_ENV
    )

    // Session should still store jwt and userData for polling flow
    expect(storedJwt).toBeDefined()
    expect(storedUserData).toBeDefined()
    expect(storedUserData!.id).toBe('user-uuid-789')
    expect(storedUserData!.email).toBe('user@gmail.com')
    expect(storedUserData!.name).toBe('Test User')
    expect(storedUserData!.subscriptionTier).toBe('pro')
  })

  it('rejects invalid redirectUri in deep link flow', async () => {
    // getOAuthState with a disallowed redirect URI
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: {
        redirect_uri: 'https://evil.com/steal',
        session_id: null,
        expires_at: new Date(Date.now() + 300000).toISOString(),
      },
      error: null,
    })

    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'google-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: 'id-token',
    })

    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: 'google-123',
      email: 'user@gmail.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/photo.jpg',
    })

    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'user-uuid',
        email: 'user@gmail.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/photo.jpg',
        subscription_tier: 'free',
      },
      error: null,
    })

    mockChain.upsert = vi.fn().mockResolvedValue({ error: null })

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?code=auth-code&state=valid-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')!
    expect(location).toContain('error=')
  })

  it('shows success page for session-based flow', async () => {
    // getOAuthState - session flow
    mockChain.single = vi.fn()
      .mockResolvedValueOnce({
        data: {
          redirect_uri: null,
          session_id: 'session-123',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      })
      // auth_sessions select return_url
      .mockResolvedValueOnce({
        data: { return_url: null },
        error: null,
      })

    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    mockChain.update = vi.fn().mockReturnValue(mockChain)

    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'google-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: 'id-token',
    })

    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: 'google-123',
      email: 'user@gmail.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/photo.jpg',
    })

    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'user-uuid',
        email: 'user@gmail.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/photo.jpg',
        subscription_tier: 'free',
      },
      error: null,
    })

    mockChain.upsert = vi.fn().mockResolvedValue({ error: null })

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?code=auth-code&state=session-state',
      {},
      TEST_ENV
    )

    // Should return HTML success page
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Success')
  })

  it('redirects to return_url for session-based flow with return_url', async () => {
    // getOAuthState
    mockChain.single = vi.fn()
      .mockResolvedValueOnce({
        data: {
          redirect_uri: null,
          session_id: 'session-456',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      })
      // auth_sessions select return_url
      .mockResolvedValueOnce({
        data: { return_url: 'https://interview-bot-web.pages.dev/checkout' },
        error: null,
      })

    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    mockChain.update = vi.fn().mockReturnValue(mockChain)

    vi.mocked(exchangeCodeForTokens).mockResolvedValue({
      access_token: 'google-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'openid email profile',
      id_token: 'id-token',
    })

    vi.mocked(getGoogleUserInfo).mockResolvedValue({
      id: 'google-123',
      email: 'user@gmail.com',
      verified_email: true,
      name: 'Test User',
      given_name: 'Test',
      family_name: 'User',
      picture: 'https://example.com/photo.jpg',
    })

    mockRpc.mockResolvedValueOnce({
      data: {
        id: 'user-uuid',
        email: 'user@gmail.com',
        display_name: 'Test User',
        avatar_url: 'https://example.com/photo.jpg',
        subscription_tier: 'free',
      },
      error: null,
    })

    mockChain.upsert = vi.fn().mockResolvedValue({ error: null })

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?code=auth-code&state=session-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('interview-bot-web.pages.dev')
    expect(location).toContain('session_id=session-456')
  })
})

describe('handleCallbackError with session and return_url', () => {
  beforeEach(resetMocks)

  it('redirects to return_url with error when session has return_url', async () => {
    // getOAuthState returns session-based state with error
    mockChain.single = vi.fn()
      .mockResolvedValueOnce({
        data: {
          redirect_uri: null,
          session_id: 'error-session-123',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      })
      // auth_sessions select return_url
      .mockResolvedValueOnce({
        data: { return_url: 'https://interview-bot-web.pages.dev/login' },
        error: null,
      })

    // update auth_sessions with error status
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?error=access_denied&state=some-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(302)
    const location = res.headers.get('Location')
    expect(location).toContain('interview-bot-web.pages.dev')
    expect(location).toContain('auth_error=')
  })

  it('shows error page when session has no return_url', async () => {
    mockChain.single = vi.fn()
      .mockResolvedValueOnce({
        data: {
          redirect_uri: null,
          session_id: 'error-session-456',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { return_url: null },
        error: null,
      })

    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    const app = createApp()
    const res = await app.request(
      '/api/auth/callback?error=access_denied&state=some-state',
      {},
      TEST_ENV
    )

    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Error')
  })
})

describe('POST /api/auth/session with DB error', () => {
  beforeEach(resetMocks)

  it('returns 500 when DB insert fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockChain.insert = vi.fn().mockResolvedValue({ error: { message: 'DB error' } })
    mockRpc.mockResolvedValue({ data: null, error: null })

    const app = createApp()
    const res = await app.request('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    consoleSpy.mockRestore()
  })

  it('returns 400 for invalid returnUrl format', async () => {
    const app = createApp()
    const res = await app.request('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: 'not-a-url' }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
  })
})

describe('GET /api/auth/google with insert error', () => {
  beforeEach(resetMocks)

  it('returns 500 when state insert fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockChain.insert = vi.fn().mockResolvedValue({ error: { message: 'insert failed' } })
    mockRpc.mockResolvedValue({ data: null, error: null })

    const app = createApp()
    const res = await app.request('/api/auth/google', {}, TEST_ENV)

    expect(res.status).toBe(500)
    consoleSpy.mockRestore()
  })
})

describe('PUT /api/auth/profile error paths', () => {
  beforeEach(resetMocks)

  it('returns 500 when profile update fails in DB', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockChain.eq = vi.fn().mockResolvedValueOnce({ error: { message: 'update failed' } })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/auth/profile', {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Test User' }),
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Failed to save profile')
    consoleSpy.mockRestore()
  })
})
