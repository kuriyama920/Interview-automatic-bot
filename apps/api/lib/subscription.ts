/**
 * サブスクリプション共通ヘルパー
 * Stripe Customer 管理、プラン解決、DB 更新
 */

import { supabaseAdmin } from './supabase'
import { stripe } from './stripe'

/**
 * ユーザーの Stripe Customer を取得または作成
 * アトミック操作で二重作成を防止
 */
export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, display_name, stripe_customer_id')
    .eq('id', userId)
    .single()

  if (error || !profile) {
    throw new Error('User not found')
  }

  if (profile.stripe_customer_id) {
    return profile.stripe_customer_id
  }

  // Stripe Customer を作成
  const customer = await stripe.customers.create({
    email: profile.email,
    name: profile.display_name || undefined,
    metadata: { userId: profile.id },
  })

  // アトミックに DB に保存（stripe_customer_id が NULL の場合のみ設定）
  // 同時リクエストで二重作成された場合、先に保存された方が返される
  const { data: savedId, error: rpcError } = await supabaseAdmin.rpc('set_stripe_customer_id', {
    p_user_id: userId,
    p_stripe_customer_id: customer.id,
  })

  if (rpcError) {
    throw new Error(`Failed to save Stripe customer ID: ${rpcError.message}`)
  }

  // 別のリクエストが先にセットしていた場合、孤立した Customer を削除
  if (savedId !== customer.id) {
    try {
      await stripe.customers.del(customer.id)
    } catch {
      console.warn(`Failed to cleanup orphaned Stripe customer: ${customer.id}`)
    }
    return savedId
  }

  return customer.id
}

/**
 * Stripe Price ID からプラン tier を解決
 */
export async function getPlanByPriceId(priceId: string): Promise<{
  tier: 'free' | 'pro' | 'max'
  name: string
} | null> {
  const { data: plans } = await supabaseAdmin
    .from('subscription_plans')
    .select('id, name, stripe_price_id_monthly, stripe_price_id_yearly')

  if (!plans) return null

  const plan = plans.find(
    (p) => p.stripe_price_id_monthly === priceId || p.stripe_price_id_yearly === priceId
  )

  if (!plan) return null

  return {
    tier: plan.id as 'free' | 'pro' | 'max',
    name: plan.name,
  }
}

/**
 * ユーザーのサブスクリプション情報を DB で更新
 */
export async function updateUserSubscription(
  userId: string,
  update: {
    subscription_tier: string
    subscription_status: string
    subscription_period_end: string | null
  }
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update(update)
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to update subscription: ${error.message}`)
  }
}

/**
 * Stripe Customer ID からユーザー ID を解決
 */
export async function getUserIdByStripeCustomer(customerId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  return profile?.id || null
}
