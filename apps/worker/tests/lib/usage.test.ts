import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkUsageLimit,
  checkAndReserveUsage,
  adjustReservedUsage,
  recordUsage,
  recalculateStorageUsage,
} from '../../src/lib/usage'
import * as usageCache from '../../src/lib/usage-cache'

// usage-cache モジュールをモック
vi.mock('../../src/lib/usage-cache', () => ({
  isUsageDenied: vi.fn().mockResolvedValue(false),
  cacheDeniedResult: vi.fn().mockResolvedValue(undefined),
  clearDeniedCache: vi.fn().mockResolvedValue(undefined),
  buildCacheKey: vi.fn(),
  DENIED_CACHE_TTL_SEC: 30,
}))

function createMockSupabase() {
  const chainMethods: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'single', 'is', 'gte', 'order']
  for (const m of methods) {
    chainMethods[m] = vi.fn().mockReturnValue(chainMethods)
  }

  const rpc = vi.fn()
  const from = vi.fn().mockReturnValue(chainMethods)

  return { from, rpc, chain: chainMethods }
}

describe('checkAndReserveUsage with denial cache', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('returns denied immediately when cache indicates denied', async () => {
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(true)

    const result = await checkAndReserveUsage(
      mockSupabase as never,
      'user-1',
      'ai_tokens',
      500
    )

    expect(result).toEqual({
      allowed: false,
      used: 0,
      limit: 0,
      remaining: 0,
    })
    // RPC should NOT be called since cache short-circuits
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('caches denied result when RPC returns not allowed', async () => {
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(false)

    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: false, used_amount: 950, limit_amount: 1000, remaining_amount: 50 }],
      error: null,
    })

    await checkAndReserveUsage(
      mockSupabase as never,
      'user-1',
      'ai_tokens',
      500
    )

    expect(usageCache.cacheDeniedResult).toHaveBeenCalledWith(
      'user-1',
      'ai_tokens',
      undefined
    )
  })

  it('does NOT cache when RPC returns allowed', async () => {
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(false)

    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: true, used_amount: 100, limit_amount: 1000, remaining_amount: 900 }],
      error: null,
    })

    await checkAndReserveUsage(
      mockSupabase as never,
      'user-1',
      'ai_tokens',
      500
    )

    expect(usageCache.cacheDeniedResult).not.toHaveBeenCalled()
  })

  it('passes ExecutionContext to cacheDeniedResult', async () => {
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(false)

    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: false, used_amount: 1000, limit_amount: 1000, remaining_amount: 0 }],
      error: null,
    })

    const mockCtx = { waitUntil: vi.fn() }

    await checkAndReserveUsage(
      mockSupabase as never,
      'user-1',
      'stt',
      10,
      mockCtx as never
    )

    expect(usageCache.cacheDeniedResult).toHaveBeenCalledWith(
      'user-1',
      'stt',
      mockCtx
    )
  })
})

describe('checkUsageLimit with denial cache', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('returns denied immediately for stt when cache indicates denied', async () => {
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(true)

    const result = await checkUsageLimit(
      mockSupabase as never,
      'user-1',
      'stt'
    )

    expect(result.allowed).toBe(false)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('returns denied immediately for documents when cache indicates denied', async () => {
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(true)

    const result = await checkUsageLimit(
      mockSupabase as never,
      'user-1',
      'documents'
    )

    expect(result).toEqual({
      allowed: false,
      used: 0,
      limit: 0,
      remaining: 0,
    })
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})

describe('checkAndReserveUsage', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    // Default: no cache hit for existing tests
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(false)
  })

  it('returns allowed when usage is within limit', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: true, used_amount: 100, limit_amount: 1000, remaining_amount: 900 }],
      error: null,
    })

    const result = await checkAndReserveUsage(
      mockSupabase as never,
      'user-1',
      'ai_tokens',
      500
    )

    expect(result).toEqual({
      allowed: true,
      used: 100,
      limit: 1000,
      remaining: 900,
    })
    expect(mockSupabase.rpc).toHaveBeenCalledWith('check_and_reserve_usage', {
      p_user_id: 'user-1',
      p_column_name: 'monthly_ai_tokens_used',
      p_reserve_amount: 500,
    })
  })

  it('returns not allowed when usage exceeds limit', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: false, used_amount: 950, limit_amount: 1000, remaining_amount: 50 }],
      error: null,
    })

    const result = await checkAndReserveUsage(
      mockSupabase as never,
      'user-1',
      'stt',
      100
    )

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(50)
  })

  it('throws on RPC error', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: { message: 'DB connection failed' },
    })

    await expect(
      checkAndReserveUsage(mockSupabase as never, 'user-1', 'ai_tokens', 100)
    ).rejects.toThrow('Usage check failed: DB connection failed')
  })

  it('throws when RPC returns empty data', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [],
      error: null,
    })

    await expect(
      checkAndReserveUsage(mockSupabase as never, 'user-1', 'ai_tokens', 100)
    ).rejects.toThrow('Usage check returned no data')
  })

  it('throws when RPC returns null data', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: null,
      error: null,
    })

    await expect(
      checkAndReserveUsage(mockSupabase as never, 'user-1', 'ai_tokens', 100)
    ).rejects.toThrow('Usage check returned no data')
  })

  it('rounds up reserve amount with Math.ceil', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: true, used_amount: 0, limit_amount: 1000, remaining_amount: 1000 }],
      error: null,
    })

    await checkAndReserveUsage(mockSupabase as never, 'user-1', 'stt', 10.3)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('check_and_reserve_usage', {
      p_user_id: 'user-1',
      p_column_name: 'monthly_stt_minutes_used',
      p_reserve_amount: 11,
    })
  })
})

describe('checkUsageLimit', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    vi.mocked(usageCache.isUsageDenied).mockResolvedValue(false)
  })

  it('delegates to checkAndReserveUsage for stt with reserveAmount=0', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: true, used_amount: 5, limit_amount: 30, remaining_amount: 25 }],
      error: null,
    })

    const result = await checkUsageLimit(mockSupabase as never, 'user-1', 'stt')

    expect(result.allowed).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('check_and_reserve_usage', {
      p_user_id: 'user-1',
      p_column_name: 'monthly_stt_minutes_used',
      p_reserve_amount: 0,
    })
  })

  it('delegates to checkAndReserveUsage for ai_tokens with reserveAmount=0', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: [{ allowed: true, used_amount: 1000, limit_amount: 30000, remaining_amount: 29000 }],
      error: null,
    })

    const result = await checkUsageLimit(mockSupabase as never, 'user-1', 'ai_tokens')

    expect(result.allowed).toBe(true)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('check_and_reserve_usage', {
      p_user_id: 'user-1',
      p_column_name: 'monthly_ai_tokens_used',
      p_reserve_amount: 0,
    })
  })

  it('checks documents count for documents type - allowed', async () => {
    // Profile query
    mockSupabase.chain.single = vi.fn()
      .mockResolvedValueOnce({ data: { subscription_tier: 'free' }, error: null })
      .mockResolvedValueOnce({ data: { max_documents: 3 }, error: null })

    // Document count query - chain returns select with count
    mockSupabase.chain.is = vi.fn().mockResolvedValue({ count: 1 })

    const result = await checkUsageLimit(mockSupabase as never, 'user-1', 'documents')

    expect(result.allowed).toBe(true)
    expect(result.used).toBe(1)
    expect(result.limit).toBe(3)
    expect(result.remaining).toBe(2)
  })

  it('checks documents count - not allowed when at limit', async () => {
    mockSupabase.chain.single = vi.fn()
      .mockResolvedValueOnce({ data: { subscription_tier: 'free' }, error: null })
      .mockResolvedValueOnce({ data: { max_documents: 3 }, error: null })

    mockSupabase.chain.is = vi.fn().mockResolvedValue({ count: 3 })

    const result = await checkUsageLimit(mockSupabase as never, 'user-1', 'documents')

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('throws when user not found for documents check', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    })

    await expect(
      checkUsageLimit(mockSupabase as never, 'user-1', 'documents')
    ).rejects.toThrow('User not found')
  })

  it('throws when subscription plan not found for documents check', async () => {
    mockSupabase.chain.single = vi.fn()
      .mockResolvedValueOnce({ data: { subscription_tier: 'unknown' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })

    await expect(
      checkUsageLimit(mockSupabase as never, 'user-1', 'documents')
    ).rejects.toThrow('Subscription plan not found')
  })
})

describe('adjustReservedUsage', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('does nothing when reserved equals actual', async () => {
    await adjustReservedUsage(mockSupabase as never, 'user-1', 'ai_tokens', 100, 100)

    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('calls RPC to adjust when amounts differ', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })

    await adjustReservedUsage(mockSupabase as never, 'user-1', 'ai_tokens', 12000, 8500)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('adjust_reserved_usage', {
      p_user_id: 'user-1',
      p_column_name: 'monthly_ai_tokens_used',
      p_reserved_amount: 12000,
      p_actual_amount: 8500,
    })
  })

  it('logs error but does not throw on RPC failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'RPC failed' } })

    await adjustReservedUsage(mockSupabase as never, 'user-1', 'stt', 100, 80)

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to adjust reserved usage:',
      'RPC failed'
    )
    consoleSpy.mockRestore()
  })

  it('rounds up amounts with Math.ceil', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })

    await adjustReservedUsage(mockSupabase as never, 'user-1', 'stt', 10.1, 8.7)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('adjust_reserved_usage', {
      p_user_id: 'user-1',
      p_column_name: 'monthly_stt_minutes_used',
      p_reserved_amount: 11,
      p_actual_amount: 9,
    })
  })
})

describe('recordUsage', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('does nothing when quantity is 0 or negative', async () => {
    await recordUsage(mockSupabase as never, 'user-1', 'stt', 0, 'minutes')
    await recordUsage(mockSupabase as never, 'user-1', 'stt', -5, 'minutes')

    expect(mockSupabase.rpc).not.toHaveBeenCalled()
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })

  it('increments profile counter and inserts usage log', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    await recordUsage(mockSupabase as never, 'user-1', 'stt', 5.3, 'minutes')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_column', {
      table_name: 'profiles',
      column_name: 'monthly_stt_minutes_used',
      increment_by: 6, // Math.ceil(5.3)
      row_id: 'user-1',
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('usage_logs')
  })

  it('skips increment when skipIncrement is true', async () => {
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    await recordUsage(mockSupabase as never, 'user-1', 'ai_completion', 1000, 'tokens', undefined, true)

    expect(mockSupabase.rpc).not.toHaveBeenCalled()
    expect(mockSupabase.from).toHaveBeenCalledWith('usage_logs')
  })

  it('throws when increment fails', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: { message: 'increment failed' } })

    await expect(
      recordUsage(mockSupabase as never, 'user-1', 'embedding', 500, 'tokens')
    ).rejects.toThrow('Failed to increment usage counter: increment failed')
  })

  it('includes metadata in usage log when provided', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    const metadata = { model: 'gpt-5-nano', type: 'completion' }
    await recordUsage(mockSupabase as never, 'user-1', 'ai_completion', 100, 'tokens', metadata)

    expect(mockSupabase.from).toHaveBeenCalledWith('usage_logs')
    expect(mockSupabase.chain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      usage_type: 'ai_completion',
      quantity: 100,
      unit: 'tokens',
      metadata,
    })
  })

  it('passes null metadata when not provided', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    await recordUsage(mockSupabase as never, 'user-1', 'stt', 10, 'minutes')

    expect(mockSupabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: null })
    )
  })

  it('maps ai_completion to monthly_ai_tokens_used column', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    await recordUsage(mockSupabase as never, 'user-1', 'ai_completion', 100, 'tokens')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_column', expect.objectContaining({
      column_name: 'monthly_ai_tokens_used',
    }))
  })

  it('maps embedding to monthly_ai_tokens_used column', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    await recordUsage(mockSupabase as never, 'user-1', 'embedding', 100, 'tokens')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_column', expect.objectContaining({
      column_name: 'monthly_ai_tokens_used',
    }))
  })

  it('maps storage to monthly_storage_bytes_used column', async () => {
    mockSupabase.rpc.mockResolvedValue({ error: null })
    mockSupabase.chain.insert = vi.fn().mockResolvedValue({ error: null })

    await recordUsage(mockSupabase as never, 'user-1', 'storage', 1024, 'bytes')

    expect(mockSupabase.rpc).toHaveBeenCalledWith('increment_column', expect.objectContaining({
      column_name: 'monthly_storage_bytes_used',
    }))
  })
})

describe('recalculateStorageUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createStorageMock(
    selectResult: { data: unknown; error: unknown },
    updateResult: { error: unknown } = { error: null },
  ) {
    const updateEq = vi.fn().mockResolvedValue(updateResult)
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq })

    // from('documents').select().eq().is() → selectResult
    // from('profiles').update().eq() → updateResult
    const fromFn = vi.fn()
      .mockImplementationOnce(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue(selectResult),
          }),
        }),
      }))
      .mockImplementationOnce(() => ({
        update: updateFn,
      }))

    return { from: fromFn, rpc: vi.fn(), updateFn, updateEq }
  }

  it('calculates total from documents and updates profiles', async () => {
    const mock = createStorageMock({
      data: [
        { file_size_bytes: 1024 },
        { file_size_bytes: 2048 },
        { file_size_bytes: 512 },
      ],
      error: null,
    })

    await recalculateStorageUsage(mock as never, 'user-1')

    expect(mock.from).toHaveBeenCalledWith('documents')
    expect(mock.from).toHaveBeenCalledWith('profiles')
    expect(mock.updateFn).toHaveBeenCalledWith({
      monthly_storage_bytes_used: 3584,
    })
    expect(mock.updateEq).toHaveBeenCalledWith('id', 'user-1')
  })

  it('handles empty documents (0 bytes)', async () => {
    const mock = createStorageMock({ data: [], error: null })

    await recalculateStorageUsage(mock as never, 'user-1')

    expect(mock.updateFn).toHaveBeenCalledWith({
      monthly_storage_bytes_used: 0,
    })
  })

  it('handles null file_size_bytes gracefully', async () => {
    const mock = createStorageMock({
      data: [
        { file_size_bytes: 1024 },
        { file_size_bytes: null },
      ],
      error: null,
    })

    await recalculateStorageUsage(mock as never, 'user-1')

    expect(mock.updateFn).toHaveBeenCalledWith({
      monthly_storage_bytes_used: 1024,
    })
  })

  it('throws on document query error', async () => {
    const mock = createStorageMock({
      data: null,
      error: { message: 'query failed' },
    })

    await expect(
      recalculateStorageUsage(mock as never, 'user-1')
    ).rejects.toThrow('Failed to calculate storage usage')
  })

  it('throws on profile update error', async () => {
    const mock = createStorageMock(
      { data: [{ file_size_bytes: 1024 }], error: null },
      { error: { message: 'update failed' } },
    )

    await expect(
      recalculateStorageUsage(mock as never, 'user-1')
    ).rejects.toThrow('Failed to update storage usage')
  })
})
