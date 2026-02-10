/**
 * STT 使用量報告エンドポイントのテスト
 * POST /api/stt/usage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from './helpers'

// 環境変数
vi.stubEnv('JWT_SECRET', 'test-jwt-secret')

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
const mockRecordUsage = vi.fn()
const mockCheckUsageLimit = vi.fn()
vi.mock('../../apps/api/lib/usage', () => ({
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
  checkUsageLimit: (...args: unknown[]) => mockCheckUsageLimit(...args),
}))

import handler from '../../apps/api/api/stt/usage'

describe('POST /api/stt/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckUsageLimit.mockResolvedValue({
      allowed: true,
      used: 15,
      limit: 600,
      remaining: 585,
    })
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

  it('should record usage and return updated stats', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: 5.3 } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockRecordUsage.mockResolvedValue(undefined)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const json = res._json as { success: boolean; recorded: number }
    expect(json.success).toBe(true)
    expect(json.recorded).toBe(6) // Math.ceil(5.3)
    expect(mockRecordUsage).toHaveBeenCalledWith('user-123', 'stt', 6, 'minutes', {
      reportedMinutes: 5.3,
      cappedMinutes: 6,
    })
  })

  it('should return 400 for missing minutes', async () => {
    const req = createMockRequest({ method: 'POST', body: {} })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for negative minutes', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: -5 } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for zero minutes', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: 0 } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for minutes exceeding max session', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: 121 } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for non-number minutes', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: 'five' } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for Infinity minutes', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: Infinity } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should return 400 for NaN minutes', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: NaN } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('should accept max session minutes (120)', async () => {
    const req = createMockRequest({ method: 'POST', body: { minutes: 120 } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockRecordUsage.mockResolvedValue(undefined)

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })
})
