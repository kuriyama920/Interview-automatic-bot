/**
 * Stripe Webhook 受信エンドポイント
 * POST /api/stripe/webhook
 *
 * JWT 認証なし。Stripe 署名検証で認証。
 * bodyParser を無効にして raw body で署名を検証する。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import Stripe from 'stripe'
import { stripe, getWebhookSecret } from '../../lib/stripe'
import { supabaseAdmin } from '../../lib/supabase'
import {
  getPlanByPriceId,
  updateUserSubscription,
  getUserIdByStripeCustomer,
} from '../../lib/subscription'

// body parser を無効化（raw body が必要）
export const config = {
  api: {
    bodyParser: false,
  },
}

/**
 * raw body を読み取る
 */
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const rawBody = await getRawBody(req)
    const sig = req.headers['stripe-signature']

    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' })
    }

    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, getWebhookSecret())
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return res.status(400).json({ error: 'Invalid signature' })
    }

    console.log(`[Webhook] Received event: ${event.type}`)

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`)
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('[Webhook] Handler error:', error)
    return res.status(500).json({ error: 'Webhook handler failed' })
  }
}

/**
 * checkout.session.completed
 * ユーザーが Checkout を完了した
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId
  if (!userId) {
    console.error('[Webhook] No userId in checkout session metadata')
    return
  }

  // サブスクリプションの詳細を取得
  if (!session.subscription) {
    console.error('[Webhook] No subscription in checkout session')
    return
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
  const priceId = subscription.items.data[0]?.price?.id

  if (!priceId) {
    console.error('[Webhook] No price ID in subscription')
    return
  }

  const plan = await getPlanByPriceId(priceId)
  if (!plan) {
    console.error('[Webhook] Unknown price ID:', priceId)
    return
  }

  await updateUserSubscription(userId, {
    subscription_tier: plan.tier,
    subscription_status: 'active',
    subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  })

  console.log(`[Webhook] User ${userId} upgraded to ${plan.tier}`)
}

/**
 * customer.subscription.updated
 * プラン変更、更新、支払い方法変更など
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
    || await getUserIdByStripeCustomer(subscription.customer as string)

  if (!userId) {
    console.error('[Webhook] Could not resolve userId for subscription update')
    return
  }

  const priceId = subscription.items.data[0]?.price?.id
  if (!priceId) return

  const plan = await getPlanByPriceId(priceId)
  if (!plan) return

  const status = subscription.cancel_at_period_end ? 'canceled' : 'active'

  await updateUserSubscription(userId, {
    subscription_tier: plan.tier,
    subscription_status: status,
    subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  })

  console.log(`[Webhook] Subscription updated for user ${userId}: ${plan.tier} (${status})`)
}

/**
 * customer.subscription.deleted
 * サブスクリプションが完全に終了
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId
    || await getUserIdByStripeCustomer(subscription.customer as string)

  if (!userId) {
    console.error('[Webhook] Could not resolve userId for subscription deletion')
    return
  }

  await updateUserSubscription(userId, {
    subscription_tier: 'free',
    subscription_status: 'canceled',
    subscription_period_end: null,
  })

  console.log(`[Webhook] Subscription deleted for user ${userId}, downgraded to free`)
}

/**
 * invoice.payment_failed
 * 支払い失敗
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  if (!customerId) return

  const userId = await getUserIdByStripeCustomer(customerId)
  if (!userId) return

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ subscription_status: 'past_due' })
    .eq('id', userId)

  if (error) {
    console.error('[Webhook] Failed to update status to past_due:', error)
  }

  console.log(`[Webhook] Payment failed for user ${userId}, marked as past_due`)
}

/**
 * invoice.paid
 * 支払い成功（更新時）
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  if (!customerId) return

  const userId = await getUserIdByStripeCustomer(customerId)
  if (!userId) return

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ subscription_status: 'active' })
    .eq('id', userId)

  if (error) {
    console.error('[Webhook] Failed to update status to active:', error)
  }

  console.log(`[Webhook] Invoice paid for user ${userId}, status set to active`)
}
