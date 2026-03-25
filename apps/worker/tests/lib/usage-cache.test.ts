import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  isUsageDenied,
  cacheDeniedResult,
  clearDeniedCache,
  buildCacheKey,
  DENIED_CACHE_TTL_SEC,
} from '../../src/lib/usage-cache'

// Cloudflare Cache API モック
const mockCache = {
  match: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

vi.stubGlobal('caches', { default: mockCache })

describe('usage-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildCacheKey', () => {
    it('userId + resourceType で一意なRequest キーを生成する', () => {
      const key1 = buildCacheKey('user-abc', 'stt')
      const key2 = buildCacheKey('user-abc', 'ai_tokens')
      const key3 = buildCacheKey('user-xyz', 'stt')

      expect(key1).toBeInstanceOf(Request)
      expect(key1.url).toBe('https://usage-denied.internal/user-abc/stt')
      expect(key2.url).toBe('https://usage-denied.internal/user-abc/ai_tokens')
      expect(key3.url).toBe('https://usage-denied.internal/user-xyz/stt')

      // 全て異なること
      expect(new Set([key1.url, key2.url, key3.url]).size).toBe(3)
    })
  })

  describe('isUsageDenied', () => {
    it('キャッシュなしの場合 false を返す', async () => {
      mockCache.match.mockResolvedValue(undefined)

      const result = await isUsageDenied('user-1', 'stt')

      expect(result).toBe(false)
      expect(mockCache.match).toHaveBeenCalledTimes(1)
      const passedKey = mockCache.match.mock.calls[0][0]
      expect(passedKey).toBeInstanceOf(Request)
      expect(passedKey.url).toBe('https://usage-denied.internal/user-1/stt')
    })

    it('拒否キャッシュがある場合 true を返す', async () => {
      mockCache.match.mockResolvedValue(new Response('denied'))

      const result = await isUsageDenied('user-1', 'ai_tokens')

      expect(result).toBe(true)
      const passedKey = mockCache.match.mock.calls[0][0]
      expect(passedKey.url).toBe('https://usage-denied.internal/user-1/ai_tokens')
    })

    it('Cache API がエラーを投げた場合 false を返す（フォールバック）', async () => {
      mockCache.match.mockRejectedValue(new Error('Cache unavailable'))

      const result = await isUsageDenied('user-1', 'stt')

      expect(result).toBe(false)
    })
  })

  describe('cacheDeniedResult', () => {
    it('Cache API に TTL 30秒で書き込む', async () => {
      await cacheDeniedResult('user-1', 'stt')

      expect(mockCache.put).toHaveBeenCalledTimes(1)

      const [requestKey, response] = mockCache.put.mock.calls[0]
      expect(requestKey).toBeInstanceOf(Request)
      expect(requestKey.url).toBe('https://usage-denied.internal/user-1/stt')
      expect(response).toBeInstanceOf(Response)
      expect(response.headers.get('Cache-Control')).toBe(
        `max-age=${DENIED_CACHE_TTL_SEC}`
      )
    })

    it('ExecutionContext が渡された場合 waitUntil で非同期実行する', async () => {
      const mockCtx = {
        waitUntil: vi.fn((promise: Promise<void>) => {
          expect(promise).toBeInstanceOf(Promise)
        }),
      }

      await cacheDeniedResult('user-1', 'ai_tokens', mockCtx as never)

      expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1)
    })

    it('Cache API がエラーを投げても例外を伝播しない', async () => {
      mockCache.put.mockRejectedValue(new Error('Cache write failed'))

      await expect(
        cacheDeniedResult('user-1', 'stt')
      ).resolves.toBeUndefined()
    })
  })

  describe('clearDeniedCache', () => {
    it('指定された userId + resourceType のキャッシュを削除する', async () => {
      mockCache.delete.mockResolvedValue(true)

      await clearDeniedCache('user-1', 'stt')

      expect(mockCache.delete).toHaveBeenCalledTimes(1)
      const passedKey = mockCache.delete.mock.calls[0][0]
      expect(passedKey).toBeInstanceOf(Request)
      expect(passedKey.url).toBe('https://usage-denied.internal/user-1/stt')
    })

    it('Cache API がエラーを投げても例外を伝播しない', async () => {
      mockCache.delete.mockRejectedValue(new Error('Cache delete failed'))

      await expect(
        clearDeniedCache('user-1', 'stt')
      ).resolves.toBeUndefined()
    })
  })

  describe('設計確認: 許可結果はキャッシュされない', () => {
    it('cacheDeniedResult のみが存在し、cacheAllowedResult は存在しない', async () => {
      const module = await import('../../src/lib/usage-cache')
      expect(module).not.toHaveProperty('cacheAllowedResult')
    })
  })

  describe('定数', () => {
    it('DENIED_CACHE_TTL_SEC は 30 である', () => {
      expect(DENIED_CACHE_TTL_SEC).toBe(30)
    })
  })
})
