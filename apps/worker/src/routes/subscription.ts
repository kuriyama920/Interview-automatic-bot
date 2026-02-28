/**
 * サブスクリプション情報ルート
 * GET /api/subscription
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', authRequired)

app.get('/', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(
      'subscription_tier, subscription_status, subscription_period_end, monthly_stt_minutes_used, monthly_ai_tokens_used, monthly_storage_bytes_used'
    )
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    return c.json({ error: 'User not found' }, 404)
  }

  const { data: currentPlan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', profile.subscription_tier)
    .single()

  const { data: allPlans } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  return c.json({
    subscription: {
      tier: profile.subscription_tier,
      status: profile.subscription_status,
      periodEnd: profile.subscription_period_end,
    },
    usage: {
      sttMinutes: profile.monthly_stt_minutes_used,
      aiTokens: profile.monthly_ai_tokens_used,
      storageBytes: profile.monthly_storage_bytes_used,
    },
    plan: currentPlan
      ? {
          id: currentPlan.id,
          name: currentPlan.name,
          priceMonthly: currentPlan.price_monthly,
          limits: {
            sttMinutesMonthly: currentPlan.stt_minutes_monthly,
            aiTokensMonthly: currentPlan.ai_tokens_monthly,
            storageBytesTotal: currentPlan.storage_bytes_total,
            maxDocuments: currentPlan.max_documents,
          },
          features: currentPlan.features,
        }
      : null,
    plans:
      allPlans?.map((p) => ({
        id: p.id,
        name: p.name,
        priceMonthly: p.price_monthly,
        priceYearly: p.price_yearly,
        stripePriceIdMonthly: p.stripe_price_id_monthly,
        stripePriceIdYearly: p.stripe_price_id_yearly,
        limits: {
          sttMinutesMonthly: p.stt_minutes_monthly,
          aiTokensMonthly: p.ai_tokens_monthly,
          storageBytesTotal: p.storage_bytes_total,
          maxDocuments: p.max_documents,
        },
        features: p.features,
      })) || [],
  })
})

export default app
