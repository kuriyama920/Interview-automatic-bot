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

vi.mock('../../src/lib/stripe', () => ({
  createStripeClient: () => ({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/test' }),
      },
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  }),
}))

vi.mock('../../src/lib/subscription', () => ({
  getOrCreateStripeCustomer: vi.fn().mockResolvedValue('cus_test123'),
  getPlanByPriceId: vi.fn(),
  updateUserSubscription: vi.fn(),
  getUserIdByStripeCustomer: vi.fn(),
}))

import stripeRoutes from '../../src/routes/stripe'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
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
  app.route('/api/stripe', stripeRoutes)
  return app
}

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/stripe/checkout',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(401)
  })

  it('rejects missing priceId', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stripe/checkout',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('priceId')
  })
})

describe('GET /api/stripe/success', () => {
  it('returns HTML success page', async () => {
    const app = createApp()
    const res = await app.request('/api/stripe/success', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
  })
})

describe('GET /api/stripe/cancel', () => {
  it('returns HTML cancel page', async () => {
    const app = createApp()
    const res = await app.request('/api/stripe/cancel', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
  })
})

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const m of chainMethods) {
      mockChain[m] = vi.fn().mockReturnValue(mockChain)
    }
  })

  it('rejects without stripe-signature header', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
  })
})
