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
const mockCacheDelete = vi.fn()
const mockCache = {
  match: mockCacheMatch,
  put: mockCachePut,
  delete: mockCacheDelete,
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

import {
  invalidateEmbeddingCache,
  invalidateEmbeddingCacheBatch,
  normalizeKey,
} from '../../src/lib/embedding-cache'

describe('normalizeKey', () => {
  it('normalizes whitespace and case', async () => {
    const key1 = await normalizeKey('Hello World')
    const key2 = await normalizeKey('hello  world')
    expect(key1).toBe(key2)
  })

  it('trims leading and trailing whitespace', async () => {
    const key1 = await normalizeKey('  test  ')
    const key2 = await normalizeKey('test')
    expect(key1).toBe(key2)
  })

  it('returns a hex string of length 64 (SHA-256)', async () => {
    const key = await normalizeKey('any text')
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('invalidateEmbeddingCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheDelete.mockResolvedValue(true)
  })

  it('calls cache.delete with the correct normalized key', async () => {
    const result = await invalidateEmbeddingCache('test question')

    expect(mockCacheDelete).toHaveBeenCalledTimes(1)
    const deletedRequest = mockCacheDelete.mock.calls[0][0]
    expect(deletedRequest).toBeInstanceOf(Request)
    expect(deletedRequest.url).toContain('https://embedding-cache.internal/')
    expect(result).toBe(true)
  })

  it('uses the same normalized key as getCachedOrGenerateEmbedding', async () => {
    mockCacheMatch.mockResolvedValue(null)
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2])

    // First, generate an embedding to see what cache key is used
    const { getCachedOrGenerateEmbedding } = await import('../../src/lib/embedding-cache')
    await getCachedOrGenerateEmbedding('Hello World', 'sk-key', undefined)
    const matchKey = mockCacheMatch.mock.calls[0][0]

    // Then invalidate with equivalent text
    await invalidateEmbeddingCache('hello  world')
    const deleteKey = mockCacheDelete.mock.calls[0][0]

    // Keys should match (same normalized form)
    expect(deleteKey.url).toBe(matchKey.url)
  })

  it('does not throw for empty string', async () => {
    await expect(invalidateEmbeddingCache('')).resolves.not.toThrow()
    expect(mockCacheDelete).toHaveBeenCalledTimes(1)
  })

  it('returns false when cache.delete returns false', async () => {
    mockCacheDelete.mockResolvedValue(false)
    const result = await invalidateEmbeddingCache('nonexistent')
    expect(result).toBe(false)
  })
})

describe('invalidateEmbeddingCacheBatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheDelete.mockResolvedValue(true)
  })

  it('deletes cache for all provided texts', async () => {
    const texts = ['question 1', 'question 2', 'question 3']
    await invalidateEmbeddingCacheBatch(texts)

    expect(mockCacheDelete).toHaveBeenCalledTimes(3)
  })

  it('handles empty array without error', async () => {
    await expect(invalidateEmbeddingCacheBatch([])).resolves.not.toThrow()
    expect(mockCacheDelete).not.toHaveBeenCalled()
  })

  it('handles array with empty strings', async () => {
    await expect(invalidateEmbeddingCacheBatch(['', '  '])).resolves.not.toThrow()
    // Both '' and '  ' normalize to the same key, so only 1 delete call
    expect(mockCacheDelete).toHaveBeenCalledTimes(1)
  })

  it('deduplicates texts that normalize to the same key', async () => {
    const texts = ['Hello World', 'hello  world', 'HELLO WORLD']
    await invalidateEmbeddingCacheBatch(texts)

    // All three normalize to the same key, so only 1 delete call
    expect(mockCacheDelete).toHaveBeenCalledTimes(1)
  })
})
