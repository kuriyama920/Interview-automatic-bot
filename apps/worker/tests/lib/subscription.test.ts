import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getOrCreateStripeCustomer,
  getPlanByPriceId,
  updateUserSubscription,
  getUserIdByStripeCustomer,
} from '../../src/lib/subscription'

function createMockSupabase() {
  const chainMethods: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'single']
  for (const m of methods) {
    chainMethods[m] = vi.fn().mockReturnValue(chainMethods)
  }

  const rpc = vi.fn()
  const from = vi.fn().mockReturnValue(chainMethods)

  return { from, rpc, chain: chainMethods }
}

function createMockStripe() {
  return {
    customers: {
      create: vi.fn(),
      del: vi.fn(),
    },
  }
}

describe('getOrCreateStripeCustomer', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let mockStripe: ReturnType<typeof createMockStripe>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
    mockStripe = createMockStripe()
  })

  it('returns existing stripe_customer_id when present', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Test',
        stripe_customer_id: 'cus_existing123',
      },
      error: null,
    })

    const result = await getOrCreateStripeCustomer(
      mockSupabase as never,
      mockStripe as never,
      'user-1'
    )

    expect(result).toBe('cus_existing123')
    expect(mockStripe.customers.create).not.toHaveBeenCalled()
  })

  it('creates new Stripe customer when none exists', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Test User',
        stripe_customer_id: null,
      },
      error: null,
    })

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new123' })
    mockSupabase.rpc.mockResolvedValue({ data: 'cus_new123', error: null })

    const result = await getOrCreateStripeCustomer(
      mockSupabase as never,
      mockStripe as never,
      'user-1'
    )

    expect(result).toBe('cus_new123')
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: 'test@test.com',
      name: 'Test User',
      metadata: { userId: 'user-1' },
    })
    expect(mockSupabase.rpc).toHaveBeenCalledWith('set_stripe_customer_id', {
      p_user_id: 'user-1',
      p_stripe_customer_id: 'cus_new123',
    })
  })

  it('handles display_name being null (passes undefined to Stripe)', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@test.com',
        display_name: null,
        stripe_customer_id: null,
      },
      error: null,
    })

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new456' })
    mockSupabase.rpc.mockResolvedValue({ data: 'cus_new456', error: null })

    const result = await getOrCreateStripeCustomer(
      mockSupabase as never,
      mockStripe as never,
      'user-1'
    )

    expect(result).toBe('cus_new456')
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: 'test@test.com',
      name: undefined,
      metadata: { userId: 'user-1' },
    })
  })

  it('throws when user not found', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    })

    await expect(
      getOrCreateStripeCustomer(mockSupabase as never, mockStripe as never, 'user-1')
    ).rejects.toThrow('User not found')
  })

  it('throws when RPC fails to save customer ID', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Test',
        stripe_customer_id: null,
      },
      error: null,
    })

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_new789' })
    mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })

    await expect(
      getOrCreateStripeCustomer(mockSupabase as never, mockStripe as never, 'user-1')
    ).rejects.toThrow('Failed to save Stripe customer ID: RPC failed')
  })

  it('handles race condition: deletes duplicate and returns winner', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Test',
        stripe_customer_id: null,
      },
      error: null,
    })

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_loser' })
    // RPC returns different ID (another request won the race)
    mockSupabase.rpc.mockResolvedValue({ data: 'cus_winner', error: null })
    mockStripe.customers.del.mockResolvedValue({})

    const result = await getOrCreateStripeCustomer(
      mockSupabase as never,
      mockStripe as never,
      'user-1'
    )

    expect(result).toBe('cus_winner')
    expect(mockStripe.customers.del).toHaveBeenCalledWith('cus_loser')
  })

  it('handles race condition cleanup failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        email: 'test@test.com',
        display_name: 'Test',
        stripe_customer_id: null,
      },
      error: null,
    })

    mockStripe.customers.create.mockResolvedValue({ id: 'cus_loser' })
    mockSupabase.rpc.mockResolvedValue({ data: 'cus_winner', error: null })
    mockStripe.customers.del.mockRejectedValue(new Error('Stripe API error'))

    const result = await getOrCreateStripeCustomer(
      mockSupabase as never,
      mockStripe as never,
      'user-1'
    )

    expect(result).toBe('cus_winner')
    expect(consoleSpy).toHaveBeenCalledWith('ORPHANED_STRIPE_CUSTOMER', expect.objectContaining({
      orphanedCustomerId: 'cus_loser',
      activeCustomerId: 'cus_winner',
    }))
    consoleSpy.mockRestore()
  })
})

describe('getPlanByPriceId', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('returns plan for matching monthly price ID', async () => {
    mockSupabase.chain.select = vi.fn().mockResolvedValue({
      data: [
        { id: 'free', name: 'Free', stripe_price_id_monthly: null, stripe_price_id_yearly: null },
        { id: 'pro', name: 'Pro', stripe_price_id_monthly: 'price_pro_monthly', stripe_price_id_yearly: 'price_pro_yearly' },
        { id: 'max', name: 'Max', stripe_price_id_monthly: 'price_max_monthly', stripe_price_id_yearly: 'price_max_yearly' },
      ],
    })

    const result = await getPlanByPriceId(mockSupabase as never, 'price_pro_monthly')

    expect(result).toEqual({ tier: 'pro', name: 'Pro' })
  })

  it('returns plan for matching yearly price ID', async () => {
    mockSupabase.chain.select = vi.fn().mockResolvedValue({
      data: [
        { id: 'pro', name: 'Pro', stripe_price_id_monthly: 'price_pro_monthly', stripe_price_id_yearly: 'price_pro_yearly' },
        { id: 'max', name: 'Max', stripe_price_id_monthly: 'price_max_monthly', stripe_price_id_yearly: 'price_max_yearly' },
      ],
    })

    const result = await getPlanByPriceId(mockSupabase as never, 'price_max_yearly')

    expect(result).toEqual({ tier: 'max', name: 'Max' })
  })

  it('returns null for unknown price ID', async () => {
    mockSupabase.chain.select = vi.fn().mockResolvedValue({
      data: [
        { id: 'pro', name: 'Pro', stripe_price_id_monthly: 'price_pro', stripe_price_id_yearly: null },
      ],
    })

    const result = await getPlanByPriceId(mockSupabase as never, 'price_unknown')

    expect(result).toBeNull()
  })

  it('returns null when no plans data returned', async () => {
    mockSupabase.chain.select = vi.fn().mockResolvedValue({ data: null })

    const result = await getPlanByPriceId(mockSupabase as never, 'price_any')

    expect(result).toBeNull()
  })
})

describe('updateUserSubscription', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('updates user subscription successfully', async () => {
    mockSupabase.chain.eq = vi.fn().mockResolvedValue({ error: null })

    await updateUserSubscription(mockSupabase as never, 'user-1', {
      subscription_tier: 'pro',
      subscription_status: 'active',
      subscription_period_end: '2026-04-21T00:00:00Z',
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('profiles')
  })

  it('throws when update fails', async () => {
    mockSupabase.chain.eq = vi.fn().mockResolvedValue({
      error: { message: 'DB error' },
    })

    await expect(
      updateUserSubscription(mockSupabase as never, 'user-1', {
        subscription_tier: 'pro',
        subscription_status: 'active',
        subscription_period_end: null,
      })
    ).rejects.toThrow('Failed to update subscription: DB error')
  })
})

describe('getUserIdByStripeCustomer', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabase()
  })

  it('returns user ID for existing customer', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: { id: 'user-1' },
      error: null,
    })

    const result = await getUserIdByStripeCustomer(mockSupabase as never, 'cus_123')

    expect(result).toBe('user-1')
  })

  it('returns null when customer not found', async () => {
    mockSupabase.chain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    })

    const result = await getUserIdByStripeCustomer(mockSupabase as never, 'cus_nonexistent')

    expect(result).toBeNull()
  })
})
