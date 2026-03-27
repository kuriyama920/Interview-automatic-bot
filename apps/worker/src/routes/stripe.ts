/**
 * Stripe ルート
 * POST /api/stripe/checkout - Checkout Session 作成
 * POST /api/stripe/portal   - Customer Portal Session 作成
 * POST /api/stripe/webhook  - Webhook 受信
 * GET  /api/stripe/success  - 成功ページ
 * GET  /api/stripe/cancel   - キャンセルページ
 */

import { Hono } from 'hono'
import Stripe from 'stripe'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { createStripeClient } from '../lib/stripe'
import { authRequired } from '../middleware/auth'
import { clearDeniedCache } from '../lib/usage-cache'
import {
  getOrCreateStripeCustomer,
  getPlanByPriceId,
  updateUserSubscription,
  getUserIdByStripeCustomer,
} from '../lib/subscription'
import { isAllowedOrigin } from '../lib/allowed-origins'
import { getBaseUrl } from '../lib/url'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// --- Success / Cancel HTML pages ---

const SUCCESS_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>決済完了 - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; background: #f9fafb; min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
    .bg-decoration { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.6; pointer-events: none; }
    .bg-1 { width: 400px; height: 400px; background: rgba(16, 185, 129, 0.15); top: -100px; right: -100px; }
    .bg-2 { width: 300px; height: 300px; background: rgba(59, 130, 246, 0.12); bottom: -50px; left: -50px; }
    .container { position: relative; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); padding: 3rem; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 8px 32px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%; animation: fadeIn 0.4s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .icon-wrapper { width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05)); border-radius: 1.25rem; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(16, 185, 129, 0.2); }
    .icon { width: 40px; height: 40px; color: #10b981; }
    h1 { color: #111827; margin-bottom: 0.5rem; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.025em; }
    .description { color: #6b7280; font-size: 0.95rem; margin-bottom: 2rem; }
    .hint { font-size: 0.875rem; color: #6b7280; background: #f3f4f6; padding: 1rem 1.25rem; border-radius: 0.75rem; line-height: 1.6; }
    .countdown { margin-top: 1.5rem; font-size: 0.75rem; color: #9ca3af; }
    .brand { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #9ca3af; font-size: 0.8rem; }
    .brand-icon { width: 20px; height: 20px; background: rgba(59, 130, 246, 0.1); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; }
    .brand-icon svg { width: 12px; height: 12px; color: #3b82f6; }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>
  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    </div>
    <h1>決済が完了しました</h1>
    <p class="description">プランのアップグレードが正常に処理されました</p>
    <div class="hint">このウィンドウを閉じて、Interview Bot アプリに戻ってください。プランは自動的に反映されます。</div>
    <p class="countdown">このページは自動的に閉じられます...</p>
    <div class="brand">
      <div class="brand-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></div>
      Interview Bot
    </div>
  </div>
  <script>setTimeout(function() { window.close(); }, 5000);</script>
</body>
</html>`

const CANCEL_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>決済キャンセル - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif; background: #f9fafb; min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
    .bg-decoration { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.5; pointer-events: none; }
    .bg-1 { width: 400px; height: 400px; background: rgba(249, 115, 22, 0.12); top: -100px; right: -100px; }
    .bg-2 { width: 300px; height: 300px; background: rgba(59, 130, 246, 0.1); bottom: -50px; left: -50px; }
    .container { position: relative; background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(20px); padding: 3rem; border-radius: 1.5rem; border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 8px 32px rgba(0,0,0,0.08); text-align: center; max-width: 420px; width: 90%; animation: fadeIn 0.4s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .icon-wrapper { width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, rgba(249, 115, 22, 0.1), rgba(249, 115, 22, 0.05)); border-radius: 1.25rem; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(249, 115, 22, 0.2); }
    .icon { width: 40px; height: 40px; color: #f97316; }
    h1 { color: #111827; margin-bottom: 0.5rem; font-size: 1.5rem; font-weight: 600; letter-spacing: -0.025em; }
    .description { color: #6b7280; font-size: 0.95rem; margin-bottom: 2rem; }
    .hint { font-size: 0.875rem; color: #6b7280; background: #f3f4f6; padding: 1rem 1.25rem; border-radius: 0.75rem; line-height: 1.6; }
    .close-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #3b82f6; color: white; border: none; border-radius: 0.5rem; font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
    .close-btn:hover { background: #2563eb; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
    .brand { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: center; gap: 0.5rem; color: #9ca3af; font-size: 0.8rem; }
    .brand-icon { width: 20px; height: 20px; background: rgba(59, 130, 246, 0.1); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; }
    .brand-icon svg { width: 12px; height: 12px; color: #3b82f6; }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>
  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
    </div>
    <h1>決済がキャンセルされました</h1>
    <p class="description">プランの変更は行われていません</p>
    <div class="hint">このウィンドウを閉じて、Interview Bot アプリに戻ってください。いつでもプランをアップグレードできます。</div>
    <button class="close-btn" onclick="window.close()">ウィンドウを閉じる</button>
    <div class="brand">
      <div class="brand-icon"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg></div>
      Interview Bot
    </div>
  </div>
</body>
</html>`

// --- Success / Cancel pages ---

app.get('/success', (c) => {
  return c.html(SUCCESS_HTML)
})

app.get('/cancel', (c) => {
  return c.html(CANCEL_HTML)
})

// --- Checkout (JWT required) ---

app.post('/checkout', authRequired, async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const stripe = createStripeClient(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json<{
    priceId?: string
    successUrl?: string
    cancelUrl?: string
  }>()

  const { priceId, successUrl, cancelUrl } = body

  if (!priceId || typeof priceId !== 'string') {
    return c.json({ error: 'priceId is required' }, 400)
  }

  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('id, stripe_price_id_monthly, stripe_price_id_yearly')

  const validPlan = plans?.find(
    (p) => p.stripe_price_id_monthly === priceId || p.stripe_price_id_yearly === priceId
  )

  if (!validPlan) {
    return c.json({ error: 'Invalid priceId' }, 400)
  }

  const customerId = await getOrCreateStripeCustomer(supabase, stripe, userId)
  const baseUrl = getBaseUrl(c.req.raw)

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
    metadata: { userId },
    subscription_data: {
      metadata: { userId },
    },
    allow_promotion_codes: true,
  })

  return c.json({ url: session.url })
})

// --- Portal (JWT required) ---

app.post('/portal', authRequired, async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const stripe = createStripeClient(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const customerId = await getOrCreateStripeCustomer(supabase, stripe, userId)
  const baseUrl = getBaseUrl(c.req.raw)

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/api/stripe/success`,
  })

  return c.json({ url: session.url })
})

// --- Webhook (no JWT, Stripe signature verification) ---

app.post('/webhook', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const stripe = createStripeClient(c.env)

  const rawBody = await c.req.text()
  const sig = c.req.header('stripe-signature')

  if (!sig) {
    return c.json({ error: 'Missing stripe-signature header' }, 400)
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, c.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return c.json({ error: 'Invalid signature' }, 400)
  }

  console.log(`[Webhook] Received event: ${event.type}`)

  // Idempotency check
  const { error: claimError } = await supabase
    .from('webhook_events')
    .insert({ event_id: event.id, event_type: event.type })

  if (claimError) {
    console.log(`[Webhook] Duplicate event ignored: ${event.id}`)
    return c.json({ received: true })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(supabase, stripe, event.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(supabase, event.data.object as Stripe.Invoice)
        break
      case 'invoice.paid':
        await handleInvoicePaid(supabase, event.data.object as Stripe.Invoice)
        break
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`)
    }
  } catch (processingError) {
    await supabase.from('webhook_events').delete().eq('event_id', event.id)
    throw processingError
  }

  void supabase.rpc('cleanup_old_webhook_events')

  return c.json({ received: true })
})

// --- Webhook handlers ---

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  const userId = session.metadata?.userId
  if (!userId) {
    console.error('[Webhook] No userId in checkout session metadata')
    return
  }

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

  const plan = await getPlanByPriceId(supabase, priceId)
  if (!plan) {
    console.error('[Webhook] Unknown price ID:', priceId)
    return
  }

  await updateUserSubscription(supabase, userId, {
    subscription_tier: plan.tier,
    subscription_status: 'active',
    subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  })

  // プランアップグレード時に使用量拒否キャッシュをクリア
  await Promise.all([
    clearDeniedCache(userId, 'stt'),
    clearDeniedCache(userId, 'ai_tokens'),
  ])

  console.log(`[Webhook] User ${userId} upgraded to ${plan.tier}`)
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  subscription: Stripe.Subscription
) {
  const userId =
    subscription.metadata?.userId ||
    (await getUserIdByStripeCustomer(supabase, subscription.customer as string))

  if (!userId) {
    console.error('[Webhook] Could not resolve userId for subscription update')
    return
  }

  const priceId = subscription.items.data[0]?.price?.id
  if (!priceId) {
    console.error('[Webhook] No price ID in subscription update for user:', userId)
    return
  }

  const plan = await getPlanByPriceId(supabase, priceId)
  if (!plan) {
    console.error('[Webhook] Unknown price ID in subscription update:', priceId, 'for user:', userId)
    return
  }

  const status = subscription.cancel_at_period_end ? 'canceled' : 'active'

  await updateUserSubscription(supabase, userId, {
    subscription_tier: plan.tier,
    subscription_status: status,
    subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  })

  // プラン変更時に使用量拒否キャッシュをクリア
  await Promise.all([
    clearDeniedCache(userId, 'stt'),
    clearDeniedCache(userId, 'ai_tokens'),
  ])

  console.log(`[Webhook] Subscription updated for user ${userId}: ${plan.tier} (${status})`)
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  subscription: Stripe.Subscription
) {
  const userId =
    subscription.metadata?.userId ||
    (await getUserIdByStripeCustomer(supabase, subscription.customer as string))

  if (!userId) {
    console.error('[Webhook] Could not resolve userId for subscription deletion')
    return
  }

  await updateUserSubscription(supabase, userId, {
    subscription_tier: 'free',
    subscription_status: 'canceled',
    subscription_period_end: null,
  })

  // ダウングレード時に使用量拒否キャッシュをクリア
  await Promise.all([
    clearDeniedCache(userId, 'stt'),
    clearDeniedCache(userId, 'ai_tokens'),
  ])

  console.log(`[Webhook] Subscription deleted for user ${userId}, downgraded to free`)
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string
  if (!customerId) return

  const userId = await getUserIdByStripeCustomer(supabase, customerId)
  if (!userId) return

  const { error } = await supabase
    .from('profiles')
    .update({ subscription_status: 'past_due' })
    .eq('id', userId)

  if (error) {
    console.error('[Webhook] Failed to update status to past_due:', error)
  }

  console.log(`[Webhook] Payment failed for user ${userId}, marked as past_due`)
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  invoice: Stripe.Invoice
) {
  const customerId = invoice.customer as string
  if (!customerId) return

  const userId = await getUserIdByStripeCustomer(supabase, customerId)
  if (!userId) return

  const { error } = await supabase
    .from('profiles')
    .update({ subscription_status: 'active' })
    .eq('id', userId)

  if (error) {
    console.error('[Webhook] Failed to update status to active:', error)
  }

  console.log(`[Webhook] Invoice paid for user ${userId}, status set to active`)
}

export default app
