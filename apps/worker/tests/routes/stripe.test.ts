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
const mockFrom = vi.fn().mockReturnValue(mockChain)

vi.mock('../../src/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

const mockCheckoutCreate = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' })
const mockPortalCreate = vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/test' })
const mockConstructEvent = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()

vi.mock('../../src/lib/stripe', () => ({
  createStripeClient: () => ({
    checkout: {
      sessions: { create: mockCheckoutCreate },
    },
    billingPortal: {
      sessions: { create: mockPortalCreate },
    },
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
    },
  }),
}))

const mockGetOrCreateStripeCustomer = vi.fn().mockResolvedValue('cus_test123')
const mockGetPlanByPriceId = vi.fn()
const mockUpdateUserSubscription = vi.fn()
const mockGetUserIdByStripeCustomer = vi.fn()

vi.mock('../../src/lib/subscription', () => ({
  getOrCreateStripeCustomer: (...args: unknown[]) => mockGetOrCreateStripeCustomer(...args),
  getPlanByPriceId: (...args: unknown[]) => mockGetPlanByPriceId(...args),
  updateUserSubscription: (...args: unknown[]) => mockUpdateUserSubscription(...args),
  getUserIdByStripeCustomer: (...args: unknown[]) => mockGetUserIdByStripeCustomer(...args),
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
    { sub: 'user-123' },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/stripe', stripeRoutes)
  return app
}

function resetMockChain() {
  vi.clearAllMocks()
  for (const m of chainMethods) {
    mockChain[m] = vi.fn().mockReturnValue(mockChain)
  }
  mockFrom.mockReturnValue(mockChain)
}

// ============================================================
// POST /api/stripe/checkout
// ============================================================

describe('POST /api/stripe/checkout', () => {
  beforeEach(resetMockChain)

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

  it('rejects invalid priceId not in subscription_plans', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    mockChain.select = vi.fn().mockReturnValue(mockChain)
    mockChain.data = null
    // simulate from('subscription_plans').select() returning empty
    mockFrom.mockReturnValue({
      ...mockChain,
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })

    const res = await app.request(
      '/api/stripe/checkout',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_invalid' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid priceId')
  })

  it('returns checkout URL for valid priceId', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    mockFrom.mockReturnValue({
      ...mockChain,
      select: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'pro',
            stripe_price_id_monthly: 'price_pro_monthly',
            stripe_price_id_yearly: 'price_pro_yearly',
          },
        ],
        error: null,
      }),
    })

    const res = await app.request(
      '/api/stripe/checkout',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: 'price_pro_monthly' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/test')
    expect(mockCheckoutCreate).toHaveBeenCalledOnce()
  })
})

// ============================================================
// POST /api/stripe/portal
// ============================================================

describe('POST /api/stripe/portal', () => {
  beforeEach(resetMockChain)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request(
      '/api/stripe/portal',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      TEST_ENV
    )
    expect(res.status).toBe(401)
  })

  it('returns portal URL with auth', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(
      '/api/stripe/portal',
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://billing.stripe.com/test')
    expect(mockPortalCreate).toHaveBeenCalledOnce()
    expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledOnce()
  })
})

// ============================================================
// GET /api/stripe/success & /cancel
// ============================================================

describe('GET /api/stripe/success', () => {
  it('returns HTML success page', async () => {
    const app = createApp()
    const res = await app.request('/api/stripe/success', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('決済が完了しました')
  })
})

describe('GET /api/stripe/cancel', () => {
  it('returns HTML cancel page', async () => {
    const app = createApp()
    const res = await app.request('/api/stripe/cancel', {}, TEST_ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    const html = await res.text()
    expect(html).toContain('決済がキャンセルされました')
  })
})

// ============================================================
// POST /api/stripe/webhook
// ============================================================

describe('POST /api/stripe/webhook', () => {
  beforeEach(resetMockChain)

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
    const body = await res.json()
    expect(body.error).toContain('stripe-signature')
  })

  it('rejects invalid signature', async () => {
    const app = createApp()
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature')
    })
    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=invalid',
        },
        body: JSON.stringify({ type: 'test' }),
      },
      TEST_ENV
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid signature')
  })

  it('handles checkout.session.completed event', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { userId: 'user-123' },
          subscription: 'sub_test_123',
        },
      },
    })
    // insert webhook_events succeeds (not duplicate)
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
    })
    mockGetPlanByPriceId.mockResolvedValue({ tier: 'pro', name: 'Pro' })

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
    expect(mockUpdateUserSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'user-123',
      expect.objectContaining({
        subscription_tier: 'pro',
        subscription_status: 'active',
      })
    )
  })

  it('handles customer.subscription.updated event', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_updated_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          metadata: { userId: 'user-456' },
          customer: 'cus_456',
          items: { data: [{ price: { id: 'price_max_monthly' } }] },
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
          cancel_at_period_end: false,
        },
      },
    })
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockGetPlanByPriceId.mockResolvedValue({ tier: 'max', name: 'Max' })

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(mockUpdateUserSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'user-456',
      expect.objectContaining({
        subscription_tier: 'max',
        subscription_status: 'active',
      })
    )
  })

  it('handles customer.subscription.deleted event (downgrade to free)', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_deleted_1',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          metadata: { userId: 'user-789' },
          customer: 'cus_789',
        },
      },
    })
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(mockUpdateUserSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'user-789',
      expect.objectContaining({
        subscription_tier: 'free',
        subscription_status: 'canceled',
        subscription_period_end: null,
      })
    )
  })

  it('handles invoice.payment_failed event', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_fail_1',
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: 'cus_fail_123',
        },
      },
    })
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockResolvedValue({ error: null })
    mockGetUserIdByStripeCustomer.mockResolvedValue('user-fail')

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(mockGetUserIdByStripeCustomer).toHaveBeenCalledWith(
      expect.anything(),
      'cus_fail_123'
    )
  })

  it('handles invoice.paid event', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_1',
      type: 'invoice.paid',
      data: {
        object: {
          customer: 'cus_paid_123',
        },
      },
    })
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockResolvedValue({ error: null })
    mockGetUserIdByStripeCustomer.mockResolvedValue('user-paid')

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(mockGetUserIdByStripeCustomer).toHaveBeenCalledWith(
      expect.anything(),
      'cus_paid_123'
    )
  })

  it('ignores duplicate webhook events (idempotency)', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_duplicate_1',
      type: 'checkout.session.completed',
      data: {
        object: { metadata: { userId: 'user-dup' }, subscription: 'sub_dup' },
      },
    })
    // insert returns error (duplicate)
    mockChain.insert = vi.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key' },
    })

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.received).toBe(true)
    // Should NOT process the event
    expect(mockUpdateUserSubscription).not.toHaveBeenCalled()
    expect(mockSubscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('handles subscription cancellation scheduled (cancel_at_period_end)', async () => {
    const app = createApp()
    mockConstructEvent.mockReturnValue({
      id: 'evt_cancel_scheduled_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          metadata: { userId: 'user-cancel' },
          customer: 'cus_cancel',
          items: { data: [{ price: { id: 'price_pro_monthly' } }] },
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 15,
          cancel_at_period_end: true,
        },
      },
    })
    mockChain.insert = vi.fn().mockResolvedValue({ error: null })
    mockGetPlanByPriceId.mockResolvedValue({ tier: 'pro', name: 'Pro' })

    const res = await app.request(
      '/api/stripe/webhook',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 't=123,v1=valid',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    )
    expect(res.status).toBe(200)
    expect(mockUpdateUserSubscription).toHaveBeenCalledWith(
      expect.anything(),
      'user-cancel',
      expect.objectContaining({
        subscription_tier: 'pro',
        subscription_status: 'canceled',
      })
    )
  })
})
