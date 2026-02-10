/**
 * サブスクリプション情報取得エンドポイント
 * GET /api/subscription
 *
 * JWT 認証必須。現在のプラン、使用量、制限、全プラン一覧を返却。
 * Electron が Checkout 後にポーリングで tier 変更を検知する。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../lib/auth'
import { setCorsHeaders, handlePreflight } from '../lib/cors'
import { supabaseAdmin } from '../lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const jwtPayload = getUserFromRequest(req)
    if (!jwtPayload) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // ユーザーのプロフィールを取得
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(
        'subscription_tier, subscription_status, subscription_period_end, monthly_stt_minutes_used, monthly_ai_tokens_used, monthly_storage_bytes_used'
      )
      .eq('id', jwtPayload.sub)
      .single()

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' })
    }

    // 現在のプラン情報を取得
    const { data: currentPlan } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', profile.subscription_tier)
      .single()

    // 全プランを取得
    const { data: allPlans } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price_monthly', { ascending: true })

    return res.status(200).json({
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
  } catch (error) {
    console.error('Subscription fetch error:', error)
    return res.status(500).json({ error: 'Failed to fetch subscription data' })
  }
}
