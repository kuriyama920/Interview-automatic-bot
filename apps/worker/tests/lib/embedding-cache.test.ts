import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to avoid reference-before-initialization
const { mockGenerateEmbedding } = vi.hoisted(() => ({
  mockGenerateEmbedding: vi.fn(),
}))

vi.mock('../../src/lib/openai', () => ({
  generateEmbedding: mockGenerateEmbedding,
}))

// Mock global caches API
const mockCacheMatch = vi.fn()
const mockCachePut = vi.fn()
const mockCache = {
  match: mockCacheMatch,
  put: mockCachePut,
}

// @ts-expect-error - mocking global caches for Workers environment
globalThis.caches = {
  default: mockCache,
}

// Mock crypto.subtle.digest for SHA-256 hashing
const originalCrypto = globalThis.crypto
if (!globalThis.crypto?.subtle?.digest) {
  // @ts-expect-error - mocking crypto for test environment
  globalThis.crypto = {
    ...originalCrypto,
    subtle: {
      ...originalCrypto?.subtle,
      async digest(_algorithm: string, data: ArrayBuffer) {
        const bytes = new Uint8Array(32)
        const input = new Uint8Array(data)
        for (let i = 0; i < input.length; i++) {
          bytes[i % 32] = (bytes[i % 32] + input[i]) & 0xff
        }
        return bytes.buffer
      },
    },
  }
}

import { getCachedOrGenerateEmbedding } from '../../src/lib/embedding-cache'

describe('getCachedOrGenerateEmbedding', () => {
  const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]

  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateEmbedding.mockResolvedValue(mockEmbedding)
    mockCacheMatch.mockResolvedValue(null)
    mockCachePut.mockResolvedValue(undefined)
  })

  it('returns cached embedding on cache hit', async () => {
    const cachedEmbedding = [0.9, 0.8, 0.7]
    mockCacheMatch.mockResolvedValueOnce({
      json: () => Promise.resolve(cachedEmbedding),
    })

    const result = await getCachedOrGenerateEmbedding(
      'test question',
      'sk-test-key',
      undefined
    )

    expect(result).toEqual(cachedEmbedding)
    expect(mockGenerateEmbedding).not.toHaveBeenCalled()
  })

  it('generates and caches embedding on cache miss', async () => {
    const mockCtx = {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext

    const result = await getCachedOrGenerateEmbedding(
      'test question',
      'sk-test-key',
      mockCtx
    )

    expect(result).toEqual(mockEmbedding)
    expect(mockGenerateEmbedding).toHaveBeenCalledWith('test question', 'sk-test-key', undefined)
    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1)
  })

  it('generates embedding without caching when ctx is undefined', async () => {
    const result = await getCachedOrGenerateEmbedding(
      'test question',
      'sk-test-key',
      undefined
    )

    expect(result).toEqual(mockEmbedding)
    expect(mockGenerateEmbedding).toHaveBeenCalledWith('test question', 'sk-test-key', undefined)
    expect(mockCachePut).not.toHaveBeenCalled()
  })

  it('normalizes key with SHA-256 (same question returns same cache key)', async () => {
    await getCachedOrGenerateEmbedding('  Test  Question  ', 'sk-test-key', undefined)
    await getCachedOrGenerateEmbedding('test question', 'sk-test-key', undefined)

    const firstCacheKey = mockCacheMatch.mock.calls[0][0]
    const secondCacheKey = mockCacheMatch.mock.calls[1][0]

    expect(firstCacheKey.url).toBe(secondCacheKey.url)
  })

  it('passes env to generateEmbedding when provided', async () => {
    const env = {
      CF_ACCOUNT_ID: 'abcdef1234567890abcdef1234567890',
      CF_AI_GATEWAY_ID: 'test-gw',
    }

    await getCachedOrGenerateEmbedding('test question', 'sk-test-key', undefined, env)

    expect(mockGenerateEmbedding).toHaveBeenCalledWith('test question', 'sk-test-key', env)
  })
})
