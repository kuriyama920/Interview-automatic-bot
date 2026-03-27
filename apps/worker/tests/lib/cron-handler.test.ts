import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetMonthlyUsage, cleanupWebhookEvents } from '../../src/lib/cron-handler'

function createMockSupabase() {
  const chainMethods: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'single', 'gte']
  for (const m of methods) {
    chainMethods[m] = vi.fn().mockReturnValue(chainMethods)
  }

  const rpc = vi.fn()
  const from = vi.fn().mockReturnValue(chainMethods)

  return { from, rpc, chain: chainMethods }
}

describe('resetMonthlyUsage', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('returns success when update succeeds', async () => {
    mockSupabase.chain.gte = vi.fn().mockResolvedValue({
      error: null,
      count: 42,
    })

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const result = await resetMonthlyUsage(mockSupabase as never)

    expect(result).toEqual({ success: true })
    expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
    expect(mockSupabase.chain.update).toHaveBeenCalledWith(
      {
        monthly_stt_minutes_used: 0,
        monthly_ai_tokens_used: 0,
        monthly_storage_bytes_used: 0,
      },
      { count: 'exact' }
    )
    expect(mockSupabase.chain.gte).toHaveBeenCalledWith('monthly_stt_minutes_used', 0)
    expect(consoleSpy).toHaveBeenCalledWith(
      '[Cron] Monthly usage reset completed. Rows affected: 42'
    )

    consoleSpy.mockRestore()
  })

  it('returns failure with error message when supabase update fails', async () => {
    mockSupabase.chain.gte = vi.fn().mockResolvedValue({
      error: { message: 'Database connection lost' },
      count: null,
    })

    const result = await resetMonthlyUsage(mockSupabase as never)

    expect(result).toEqual({
      success: false,
      error: 'Database connection lost',
    })
  })
})

describe('cleanupWebhookEvents', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('calls rpc cleanup_old_webhook_events on success', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })

    await cleanupWebhookEvents(mockSupabase as never)

    expect(mockSupabase.rpc).toHaveBeenCalledWith('cleanup_old_webhook_events')
  })

  it('catches and logs error when rpc fails without throwing', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const rpcError = new Error('RPC timeout')
    mockSupabase.rpc.mockRejectedValue(rpcError)

    await cleanupWebhookEvents(mockSupabase as never)

    expect(consoleSpy).toHaveBeenCalledWith(
      '[Cron] Webhook cleanup failed:',
      rpcError
    )

    consoleSpy.mockRestore()
  })
})
