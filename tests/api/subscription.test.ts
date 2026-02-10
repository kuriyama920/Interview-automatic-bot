/**
 * サブスクリプションエンドポイントのテスト
 * GET /api/subscription
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from './helpers'

// 環境変数を設定
vi.stubEnv('JWT_SECRET', 'test-jwt-secret')
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-key')

// Supabase モック
const mockSingle = vi.fn()
const mockOrder = vi.fn(() => ({ data: [], error: null }))
const mockEq = vi.fn(() => ({
  single: mockSingle,
  order: mockOrder,
}))
const mockSelect = vi.fn(() => ({
  eq: mockEq,
}))

vi.mock('../../apps/api/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}))

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

import handler from '../../apps/api/api/subscription'

describe('GET /api/subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 405 for non-GET methods', async () => {
    const req = createMockRequest({ method: 'POST' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue(null)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(405)
    expect(res._json).toEqual({ error: 'Method not allowed' })
  })

  it('should return 401 without authentication', async () => {
    const req = createMockRequest({ method: 'GET' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue(null)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res._json).toEqual({ error: 'Unauthorized' })
  })

  it('should return 404 when user not found', async () => {
    const req = createMockRequest({ method: 'GET' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('should return subscription data for authenticated user', async () => {
    const req = createMockRequest({ method: 'GET' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    // Profile query
    mockSingle.mockResolvedValueOnce({
      data: {
        subscription_tier: 'pro',
        subscription_status: 'active',
        subscription_period_end: '2026-03-10',
        monthly_stt_minutes_used: 100,
        monthly_ai_tokens_used: 50000,
        monthly_storage_bytes_used: 1000000,
      },
      error: null,
    })

    // Current plan query
    mockSingle.mockResolvedValueOnce({
      data: {
        id: 'pro',
        name: 'Pro',
        price_monthly: 2980,
        stt_minutes_monthly: 600,
        ai_tokens_monthly: 500000,
        storage_bytes_total: 524288000,
        max_documents: 50,
        features: { custom_api_keys: true },
      },
      error: null,
    })

    // All plans query
    mockOrder.mockReturnValueOnce({
      data: [
        { id: 'free', name: 'Free', price_monthly: 0, stt_minutes_monthly: 30, ai_tokens_monthly: 30000, storage_bytes_total: 52428800, max_documents: 3, features: {} },
        { id: 'pro', name: 'Pro', price_monthly: 2980, stt_minutes_monthly: 600, ai_tokens_monthly: 500000, storage_bytes_total: 524288000, max_documents: 50, features: { custom_api_keys: true } },
      ],
      error: null,
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res._json).toHaveProperty('subscription')
    expect(res._json).toHaveProperty('usage')
    expect(res._json).toHaveProperty('plan')
    expect(res._json).toHaveProperty('plans')
    expect((res._json as { subscription: { tier: string } }).subscription.tier).toBe('pro')
  })

  it('should handle OPTIONS preflight', async () => {
    const req = createMockRequest({ method: 'OPTIONS' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })
})
