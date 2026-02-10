/**
 * Stripe Checkout Session 作成エンドポイント
 * POST /api/stripe/checkout
 *
 * JWT 認証必須。priceId を受け取り Checkout Session URL を返却。
 * Electron が shell.openExternal() でブラウザを開く。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { stripe } from '../../lib/stripe'
import { getOrCreateStripeCustomer } from '../../lib/subscription'
import { supabaseAdmin } from '../../lib/supabase'
import { isAllowedOrigin } from '../../lib/allowed-origins'
import { getBaseUrl } from '../../lib/url'

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
    const jwtPayload = getUserFromRequest(req)
    if (!jwtPayload) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { priceId, successUrl, cancelUrl } = req.body || {}

    if (!priceId || typeof priceId !== 'string') {
      return res.status(400).json({ error: 'priceId is required' })
    }

    // priceId が有効なプランに紐づいているか検証
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

    // ベースURL を取得
    const baseUrl = getBaseUrl(req)

    // Webチェックアウトフロー: カスタムリダイレクトURLの検証
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
  } catch (error) {
    console.error('Checkout session error:', error)
    return res.status(500).json({ error: 'Failed to create checkout session' })
  }
}
