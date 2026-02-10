/**
 * Stripe クライアント初期化
 * lib/supabase.ts と同じ遅延初期化 Proxy パターン
 */

import Stripe from 'stripe'

let _stripe: Stripe | null = null

/**
 * Stripe クライアントを取得（遅延初期化）
 */
function getStripe(): Stripe {
  if (_stripe) {
    return _stripe
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set')
  }

  _stripe = new Stripe(secretKey, {
    apiVersion: '2024-04-10' as Stripe.LatestApiVersion,
    typescript: true,
  })

  return _stripe
}

// Proxy で遅延アクセス（supabase.ts と同パターン）
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return getStripe()[prop as keyof Stripe]
  },
})

/**
 * Webhook シークレットを取得
 */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set')
  }
  return secret
}
