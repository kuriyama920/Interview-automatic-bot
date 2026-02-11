/**
 * Stripe 課金統合エンドポイント
 * POST /api/stripe/checkout - Checkout Session 作成
 * POST /api/stripe/portal - Customer Portal Session 作成
 *
 * JWT 認証必須。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { stripe } from '../../lib/stripe'
import { getOrCreateStripeCustomer } from '../../lib/subscription'
import { supabaseAdmin } from '../../lib/supabase'
import { isAllowedOrigin } from '../../lib/allowed-origins'
import { getBaseUrl } from '../../lib/url'
import { getRoute } from '../../lib/routing'

async function handleCheckout(req: VercelRequest, res: VercelResponse) {
  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { priceId, successUrl, cancelUrl } = req.body || {}

  if (!priceId || typeof priceId !== 'string') {
    return res.status(400).json({ error: 'priceId is required' })
  }

  const { data: plans } = await supabaseAdmin
    .from('subscription_plans')
    .select('id, stripe_price_id_monthly, stripe_price_id_yearly')

  const validPlan = plans?.find(
    (p) => p.stripe_price_id_monthly === priceId || p.stripe_price_id_yearly === priceId
  )

  if (!validPlan) {
    return res.status(400).json({ error: 'Invalid priceId' })
  }

  const customerId = await getOrCreateStripeCustomer(jwtPayload.sub)
  const baseUrl = getBaseUrl(req)

  const finalSuccessUrl =
    successUrl && typeof successUrl === 'string' && isAllowedOrigin(successUrl)
      ? `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`
      : `${baseUrl}/api/stripe/success?session_id={CHECKOUT_SESSION_ID}`

  const finalCancelUrl =
    cancelUrl && typeof cancelUrl === 'string' && isAllowedOrigin(cancelUrl)
      ? cancelUrl
      : `${baseUrl}/api/stripe/cancel`

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: finalSuccessUrl,
    cancel_url: finalCancelUrl,
    metadata: { userId: jwtPayload.sub },
    subscription_data: {
      metadata: { userId: jwtPayload.sub },
    },
    allow_promotion_codes: true,
  })

  return res.status(200).json({ url: session.url })
}

async function handlePortal(req: VercelRequest, res: VercelResponse) {
  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const customerId = await getOrCreateStripeCustomer(jwtPayload.sub)
  const baseUrl = getBaseUrl(req)

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/api/stripe/success`,
  })

  return res.status(200).json({ url: session.url })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const route = getRoute(req)

    switch (route) {
      case 'checkout':
        return handleCheckout(req, res)
      case 'portal':
        return handlePortal(req, res)
      default:
        return res.status(404).json({ error: 'Not found' })
    }
  } catch (error) {
    console.error('Stripe billing error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
