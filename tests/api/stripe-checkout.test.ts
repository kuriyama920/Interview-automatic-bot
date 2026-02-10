/**
 * Stripe Checkout エンドポイントのテスト
 * POST /api/stripe/checkout
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from './helpers'

// 環境変数
vi.stubEnv('JWT_SECRET', 'test-jwt-secret')
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_xxx')
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')

// Auth モック
const mockGetUserFromRequest = vi.fn()
vi.mock('../../apps/api/lib/auth', () => ({
  getUserFromRequest: (...args: unknown[]) => mockGetUserFromRequest(...args),
}))

// CORS モック
vi.mock('../../apps/api/lib/cors', () => ({
  setCorsHeaders: vi.fn(() => true),
  handlePreflight: vi.fn((res) => { res.status(200).end() }),
}))

// Stripe モック
const mockCheckoutCreate = vi.fn()
vi.mock('../../apps/api/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mockCheckoutCreate(...args),
      },
    },
  },
}))

// Subscription モック
const mockGetOrCreateStripeCustomer = vi.fn()
vi.mock('../../apps/api/lib/subscription', () => ({
  getOrCreateStripeCustomer: (...args: unknown[]) => mockGetOrCreateStripeCustomer(...args),
}))

// Supabase モック
const mockFind = vi.fn()
vi.mock('../../apps/api/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        data: [
          { id: 'pro', stripe_price_id_monthly: 'price_pro_monthly', stripe_price_id_yearly: null },
          { id: 'max', stripe_price_id_monthly: 'price_max_monthly', stripe_price_id_yearly: null },
        ],
        error: null,
      })),
    })),
  },
}))

import handler from '../../apps/api/api/stripe/checkout'

describe('POST /api/stripe/checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 405 for non-POST methods', async () => {
    const req = createMockRequest({ method: 'GET' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('should return 401 without authentication', async () => {
    const req = createMockRequest({ method: 'POST' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue(null)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('should return 400 for missing priceId', async () => {
    const req = createMockRequest({ method: 'POST', body: {} })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res._json).toEqual({ error: 'priceId is required' })
  })

  it('should return 400 for invalid priceId', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { priceId: 'invalid_price' },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res._json).toEqual({ error: 'Invalid priceId' })
  })

  it('should create checkout session and return URL', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { priceId: 'price_pro_monthly' },
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'api.example.com',
      },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test123')
    mockCheckoutCreate.mockResolvedValue({
      url: 'https://checkout.stripe.com/session/abc',
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res._json).toEqual({ url: 'https://checkout.stripe.com/session/abc' })
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_test123',
        mode: 'subscription',
        metadata: { userId: 'user-123' },
      })
    )
  })

  it('should handle OPTIONS preflight', async () => {
    const req = createMockRequest({ method: 'OPTIONS' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })
})
