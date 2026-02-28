/**
 * Stripe クライアント ファクトリ
 */

import Stripe from 'stripe'
import type { Env } from '../types'

/**
 * Stripe クライアントを生成
 */
export function createStripeClient(env: Env): Stripe {
  return new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
  })
}
