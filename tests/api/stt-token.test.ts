/**
 * STT トークン発行エンドポイントのテスト
 * POST /api/stt/token
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from './helpers'

// 環境変数
vi.stubEnv('JWT_SECRET', 'test-jwt-secret')
vi.stubEnv('DEEPGRAM_API_KEY', 'test-deepgram-key')

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

// Usage モック
const mockCheckUsageLimit = vi.fn()
const mockHasCustomApiKey = vi.fn()
vi.mock('../../apps/api/lib/usage', () => ({
  checkUsageLimit: (...args: unknown[]) => mockCheckUsageLimit(...args),
  hasCustomApiKey: (...args: unknown[]) => mockHasCustomApiKey(...args),
}))

// Deepgram モック
const mockGenerateTemporaryToken = vi.fn()
vi.mock('../../apps/api/lib/deepgram', () => ({
  generateTemporaryToken: (...args: unknown[]) => mockGenerateTemporaryToken(...args),
  DEFAULT_STT_CONFIG: {
    model: 'nova-2',
    language: 'ja',
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1,
    smartFormat: true,
    interimResults: true,
    utteranceEndMs: 1000,
    vadEvents: true,
  },
}))

import handler from '../../apps/api/api/stt/token'

describe('POST /api/stt/token', () => {
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

  it('should return useCustomKey for users with custom API key', async () => {
    const req = createMockRequest({ method: 'POST' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockHasCustomApiKey.mockResolvedValue(true)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res._json).toEqual({ success: true, useCustomKey: true })
  })

  it('should return 429 when usage limit exceeded', async () => {
    const req = createMockRequest({ method: 'POST' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockHasCustomApiKey.mockResolvedValue(false)
    mockCheckUsageLimit.mockResolvedValue({
      allowed: false,
      used: 30,
      limit: 30,
      remaining: 0,
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(429)
    expect(res._json).toHaveProperty('error')
    expect(res._json).toHaveProperty('usage')
  })

  it('should return temporary token when within limits', async () => {
    const req = createMockRequest({ method: 'POST' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockHasCustomApiKey.mockResolvedValue(false)
    mockCheckUsageLimit.mockResolvedValue({
      allowed: true,
      used: 10,
      limit: 600,
      remaining: 590,
    })
    mockGenerateTemporaryToken.mockResolvedValue({
      token: 'temp-token-abc',
      expiresIn: 600,
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const json = res._json as { success: boolean; token: string; expiresIn: number; config: unknown; usage: unknown }
    expect(json.success).toBe(true)
    expect(json.token).toBe('temp-token-abc')
    expect(json.expiresIn).toBe(600)
    expect(json.config).toBeDefined()
    expect(json.usage).toEqual({
      used: 10,
      limit: 600,
      remaining: 590,
    })
  })

  it('should return 500 on unexpected error', async () => {
    const req = createMockRequest({ method: 'POST' })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockHasCustomApiKey.mockRejectedValue(new Error('DB error'))

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res._json).toEqual({ error: 'Failed to generate STT token' })
  })
})
