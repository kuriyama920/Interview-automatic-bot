/**
 * AI 回答生成エンドポイントのテスト
 * POST /api/ai/generate - バリデーション・認証・使用量チェック
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRequest, createMockResponse } from './helpers'

// 環境変数
vi.stubEnv('JWT_SECRET', 'test-jwt-secret')
vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
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

// Usage モック
const mockCheckAndReserveUsage = vi.fn()
const mockAdjustReservedUsage = vi.fn()
const mockRecordUsage = vi.fn()
const mockHasCustomApiKey = vi.fn()
vi.mock('../../apps/api/lib/usage', () => ({
  checkAndReserveUsage: (...args: unknown[]) => mockCheckAndReserveUsage(...args),
  adjustReservedUsage: (...args: unknown[]) => mockAdjustReservedUsage(...args),
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
  hasCustomApiKey: (...args: unknown[]) => mockHasCustomApiKey(...args),
}))

// Supabase モック
vi.mock('../../apps/api/lib/supabase', () => ({
  supabaseAdmin: {
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  },
}))

// OpenAI Embedding モック
vi.mock('../../apps/api/lib/openai', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
}))

// Prompts モック
vi.mock('../../apps/api/lib/prompts', () => ({
  SYSTEM_PROMPT: 'テスト用プロンプト',
}))

// Env モック
vi.mock('../../apps/api/lib/env', () => ({
  getEnv: vi.fn((key: string) => {
    const envMap: Record<string, string> = {
      OPENAI_API_KEY: 'test-openai-key',
      JWT_SECRET: 'test-jwt-secret',
    }
    return envMap[key] || `test-${key}`
  }),
}))

// OpenAI SDK モック（ストリーミング）
const mockStreamCreate = vi.fn()
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockStreamCreate,
      },
    },
  })),
}))

import handler from '../../apps/api/api/ai/generate'

describe('POST /api/ai/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockHasCustomApiKey.mockResolvedValue(false)
    mockCheckAndReserveUsage.mockResolvedValue({
      allowed: true,
      used: 1000,
      limit: 500000,
      remaining: 499000,
    })
    mockAdjustReservedUsage.mockResolvedValue(undefined)
    mockRecordUsage.mockResolvedValue(undefined)
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

  it('should return 400 for missing question', async () => {
    const req = createMockRequest({ method: 'POST', body: {} })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res._json).toEqual({ error: 'question is required and must be a string' })
  })

  it('should return 400 for empty question', async () => {
    const req = createMockRequest({ method: 'POST', body: { question: '  ' } })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res._json).toEqual({ error: 'question cannot be empty' })
  })

  it('should return 400 for question exceeding max length', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: 'a'.repeat(2001) },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect((res._json as { error: string }).error).toContain('2000')
  })

  it('should return 429 when usage limit exceeded', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: 'テスト質問' },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockHasCustomApiKey.mockResolvedValue(false)
    mockCheckAndReserveUsage.mockResolvedValue({
      allowed: false,
      used: 500000,
      limit: 500000,
      remaining: 0,
    })

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(429)
    expect((res._json as { error: string }).error).toContain('limit exceeded')
  })

  it('should skip usage check for custom API key users', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: 'テスト質問' },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })
    mockHasCustomApiKey.mockResolvedValue(true)

    // Async iterable を模擬してストリーミングを返す
    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'テスト' } }], usage: null }
        yield { choices: [{ delta: { content: '回答' } }], usage: { total_tokens: 100 } }
      },
    }
    mockStreamCreate.mockResolvedValue(mockStream)

    await handler(req, res)

    expect(mockCheckAndReserveUsage).not.toHaveBeenCalled()
    // 使用量記録もスキップ
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })

  it('should stream response as SSE', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: '自己紹介してください' },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: '回答' } }], usage: null }
        yield { choices: [{ delta: { content: 'です' } }], usage: null }
        yield { choices: [{ delta: { content: '' } }], usage: { total_tokens: 50 } }
      },
    }
    mockStreamCreate.mockResolvedValue(mockStream)

    await handler(req, res)

    // SSE ヘッダーが設定されている
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform')

    // チャンクが書き込まれている
    const written = (res as unknown as { _written: string[] })._written
    expect(written.some((w) => w.includes('"type":"chunk"'))).toBe(true)
    expect(written.some((w) => w.includes('"type":"done"'))).toBe(true)

    // 使用量が記録されている（skipIncrement=true でログのみ）
    expect(mockRecordUsage).toHaveBeenCalledWith(
      'user-123',
      'ai_completion',
      50,
      'tokens',
      expect.objectContaining({ model: 'gpt-5-mini' }),
      true
    )
  })

  it('should not pass temperature for gpt-5-mini', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: 'テスト', temperature: 0.7 },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'OK' } }], usage: { total_tokens: 10 } }
      },
    }
    mockStreamCreate.mockResolvedValue(mockStream)

    await handler(req, res)

    // gpt-5-mini で temperature が渡されていないことを確認
    const createCall = mockStreamCreate.mock.calls[0][0]
    expect(createCall.model).toBe('gpt-5-mini')
    expect(createCall).not.toHaveProperty('temperature')
  })

  it('should pass temperature for non-gpt-5-mini models', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: 'テスト', model: 'gpt-4o-mini', temperature: 0.5 },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'OK' } }], usage: { total_tokens: 10 } }
      },
    }
    mockStreamCreate.mockResolvedValue(mockStream)

    await handler(req, res)

    // gpt-4o-mini では temperature が渡される
    const createCall = mockStreamCreate.mock.calls[0][0]
    expect(createCall.model).toBe('gpt-4o-mini')
    expect(createCall.temperature).toBe(0.5)
  })

  it('should reject non-allowlisted models and fallback to default', async () => {
    const req = createMockRequest({
      method: 'POST',
      body: { question: 'テスト', model: 'gpt-4' },
    })
    const res = createMockResponse()
    mockGetUserFromRequest.mockReturnValue({ sub: 'user-123' })

    const mockStream = {
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'OK' } }], usage: { total_tokens: 10 } }
      },
    }
    mockStreamCreate.mockResolvedValue(mockStream)

    await handler(req, res)

    // 許可されていないモデルはデフォルトにフォールバック
    const createCall = mockStreamCreate.mock.calls[0][0]
    expect(createCall.model).toBe('gpt-5-mini')
  })

  it('should handle OPTIONS preflight', async () => {
    const req = createMockRequest({ method: 'OPTIONS' })
    const res = createMockResponse()

    await handler(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
  })
})
