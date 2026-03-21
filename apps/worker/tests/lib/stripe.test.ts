import { describe, it, expect, vi } from 'vitest'

// Mock Stripe constructor
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation((key: string, opts: unknown) => ({
      _key: key,
      _opts: opts,
    })),
  }
})

import { createStripeClient } from '../../src/lib/stripe'
import type { Env } from '../../src/types'

describe('createStripeClient', () => {
  it('creates a Stripe client with the secret key from env', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_test_abc123' } as Env

    const client = createStripeClient(env) as unknown as { _key: string; _opts: { typescript: boolean } }

    expect(client._key).toBe('sk_test_abc123')
    expect(client._opts).toEqual({ typescript: true })
  })

  it('uses the exact STRIPE_SECRET_KEY from env', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_xyz789' } as Env

    const client = createStripeClient(env) as unknown as { _key: string }

    expect(client._key).toBe('sk_live_xyz789')
  })
})
