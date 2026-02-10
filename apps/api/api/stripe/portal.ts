/**
 * Stripe Customer Portal セッション作成エンドポイント
 * POST /api/stripe/portal
 *
 * JWT 認証必須。Customer Portal URL を返却。
 * ユーザーが自分でプラン変更・解約・支払い方法更新を行える。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { stripe } from '../../lib/stripe'
import { getOrCreateStripeCustomer } from '../../lib/subscription'
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

    const customerId = await getOrCreateStripeCustomer(jwtPayload.sub)

    // ベースURL を取得
    const baseUrl = getBaseUrl(req)

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/api/stripe/success`,
    })

    return res.status(200).json({ url: session.url })
  } catch (error) {
    console.error('Portal session error:', error)
    return res.status(500).json({ error: 'Failed to create portal session' })
  }
}
