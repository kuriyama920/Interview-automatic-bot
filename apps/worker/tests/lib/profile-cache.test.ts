import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { getCachedProfile, invalidateProfileCache } from '../../src/lib/profile-cache'

// Supabase mock helper
function createMockSupabase(resolvedValue: { data: unknown; error: unknown }) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(resolvedValue),
        }),
      }),
    }),
  }
}

describe('getCachedProfile', () => {
  const mockProfile = {
    fullName: 'Test User',
    targetCompany: 'Test Corp',
    technologies: ['TypeScript', 'React'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheMatch.mockResolvedValue(null)
    mockCachePut.mockResolvedValue(undefined)
    mockCacheDelete.mockResolvedValue(true)
  })

  it('fetches profile from Supabase on cache miss and returns it', async () => {
    const supabase = createMockSupabase({
      data: { interview_profile: mockProfile },
      error: null,
    })

    const result = await getCachedProfile('user-123', supabase as never)

    expect(result).toEqual(mockProfile)
    expect(supabase.from).toHaveBeenCalledWith('profiles')
    expect(mockCacheMatch).toHaveBeenCalledTimes(1)
  })

  it('writes to cache via ctx.waitUntil on cache miss', async () => {
    const supabase = createMockSupabase({
      data: { interview_profile: mockProfile },
      error: null,
    })
    const mockCtx = {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext

    await getCachedProfile('user-123', supabase as never, mockCtx)

    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1)
    // Verify cache.put is called inside waitUntil
    const waitUntilArg = (mockCtx.waitUntil as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // waitUntilArg should be a Promise (from cache.put)
    expect(waitUntilArg).toBeInstanceOf(Promise)
  })

  it('returns profile from cache without calling Supabase on cache hit', async () => {
    mockCacheMatch.mockResolvedValueOnce({
      json: () => Promise.resolve(mockProfile),
    })

    const supabase = createMockSupabase({
      data: { interview_profile: mockProfile },
      error: null,
    })

    const result = await getCachedProfile('user-123', supabase as never)

    expect(result).toEqual(mockProfile)
    // Supabase should NOT be called
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('caches null profile when Supabase returns null', async () => {
    const supabase = createMockSupabase({
      data: { interview_profile: null },
      error: null,
    })
    const mockCtx = {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext

    const result = await getCachedProfile('user-123', supabase as never, mockCtx)

    expect(result).toBeNull()
    expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1)
  })

  it('skips cache write when ctx is undefined', async () => {
    const supabase = createMockSupabase({
      data: { interview_profile: mockProfile },
      error: null,
    })

    const result = await getCachedProfile('user-123', supabase as never)

    expect(result).toEqual(mockProfile)
    expect(mockCachePut).not.toHaveBeenCalled()
  })

  it('uses correct cache key format with userId', async () => {
    const supabase = createMockSupabase({
      data: { interview_profile: mockProfile },
      error: null,
    })

    await getCachedProfile('user-abc-456', supabase as never)

    const cacheKey = mockCacheMatch.mock.calls[0][0]
    expect(cacheKey.url).toBe('https://profile-cache.internal/user-abc-456')
  })

  it('returns null when Supabase returns error', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'Not found' },
    })

    const result = await getCachedProfile('user-123', supabase as never)

    expect(result).toBeNull()
  })
})

describe('invalidateProfileCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCacheDelete.mockResolvedValue(true)
  })

  it('deletes the correct cache key', async () => {
    await invalidateProfileCache('user-123')

    expect(mockCacheDelete).toHaveBeenCalledTimes(1)
    const cacheKey = mockCacheDelete.mock.calls[0][0]
    expect(cacheKey.url).toBe('https://profile-cache.internal/user-123')
  })
})
