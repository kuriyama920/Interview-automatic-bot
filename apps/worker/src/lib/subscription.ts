/**
 * サブスクリプション共通ヘルパー
 * Stripe Customer 管理、プラン解決、DB 更新
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

/**
 * ユーザーの Stripe Customer を取得または作成
 */
export async function getOrCreateStripeCustomer(
  supabase: SupabaseClient,
  stripe: Stripe,
  userId: string
): Promise<string> {
  const { data: profile, error } = await supabase
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

  const customer = await stripe.customers.create({
    email: profile.email,
    name: profile.display_name || undefined,
    metadata: { userId: profile.id },
  })

  const { data: savedId, error: rpcError } = await supabase.rpc('set_stripe_customer_id', {
    p_user_id: userId,
    p_stripe_customer_id: customer.id,
  })

  if (rpcError) {
    throw new Error(`Failed to save Stripe customer ID: ${rpcError.message}`)
  }

  if (savedId !== customer.id) {
    try {
      await stripe.customers.del(customer.id)
    } catch (cleanupError) {
      console.error('ORPHANED_STRIPE_CUSTOMER', {
        orphanedCustomerId: customer.id,
        activeCustomerId: savedId,
        userId,
        error: String(cleanupError),
      })
    }
    return savedId
  }

  return customer.id
}

/**
 * Stripe Price ID からプラン tier を解決
 */
export async function getPlanByPriceId(
  supabase: SupabaseClient,
  priceId: string
): Promise<{ tier: 'free' | 'pro' | 'max'; name: string } | null> {
  const { data: plans } = await supabase
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
  supabase: SupabaseClient,
  userId: string,
  update: {
    subscription_tier: string
    subscription_status: string
    subscription_period_end: string | null
  }
): Promise<void> {
  const { error } = await supabase
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
export async function getUserIdByStripeCustomer(
  supabase: SupabaseClient,
  customerId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  return profile?.id || null
}
