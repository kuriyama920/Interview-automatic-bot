import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const chainMethods = ['select', 'eq', 'is', 'single', 'order']
for (const m of chainMethods) {
  mockChain[m] = vi.fn().mockReturnValue(mockChain)
}

vi.mock('../../src/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue(mockChain),
  }),
}))

import subscriptionRoutes from '../../src/routes/subscription'

const TEST_ENV = { JWT_SECRET: TEST_JWT_SECRET } as Env

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: 'user-123', email: 'test@example.com', name: 'Test', picture: '' },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/subscription', subscriptionRoutes)
  return app
}

describe('GET /api/subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/subscription', {}, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns 404 when user not found', async () => {
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/subscription', { headers }, TEST_ENV)
    expect(res.status).toBe(404)
  })

  it('returns subscription info for valid user', async () => {
    const profileData = {
      subscription_tier: 'pro',
      subscription_status: 'active',
      subscription_period_end: '2026-03-01T00:00:00Z',
      monthly_stt_minutes_used: 30,
      monthly_ai_tokens_used: 15000,
      monthly_storage_bytes_used: 1024000,
    }

    const planData = {
      id: 'pro',
      name: 'Pro',
      price_monthly: 2980,
      stt_minutes_monthly: 600,
      ai_tokens_monthly: 500000,
      storage_bytes_total: 50 * 1024 * 1024,
      max_documents: 50,
      features: ['feature1'],
    }

    const allPlansData = [planData]

    // First call: profiles query
    let callCount = 0
    mockChain.single = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.resolve({ data: profileData, error: null })
      if (callCount === 2) return Promise.resolve({ data: planData, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    mockChain.order = vi.fn().mockResolvedValueOnce({ data: allPlansData, error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/subscription', { headers }, TEST_ENV)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.subscription.tier).toBe('pro')
    expect(body.usage.sttMinutes).toBe(30)
  })
})
