/**
 * サブスクリプション共通ヘルパー
 * Stripe Customer 管理、プラン解決、DB 更新
 */

import { supabaseAdmin } from './supabase'
import { stripe } from './stripe'

/**
 * ユーザーの Stripe Customer を取得または作成
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

  // DB に保存
  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)

  if (updateError) {
    throw new Error(`Failed to save Stripe customer ID: ${updateError.message}`)
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
