/**
 * 使用量追跡・制限チェック
 *
 * checkUsageLimit(): 使用量上限チェック（副作用なし）
 * checkAndReserveUsage(): アトミックな使用量チェック＋予約（同時使用安全）
 * adjustReservedUsage(): 予約量と実際の使用量の差分を調整
 * recordUsage(): 使用量記録（profiles カウンター + usage_logs）
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isUsageDenied, cacheDeniedResult } from './usage-cache'

type ResourceType = 'stt' | 'ai_tokens' | 'documents'
type UsageType = 'stt' | 'ai_completion' | 'embedding' | 'storage'

interface UsageLimitResult {
  allowed: boolean
  used: number
  limit: number
  remaining: number
}

const RESOURCE_COLUMN_MAP: Record<string, string> = {
  stt: 'monthly_stt_minutes_used',
  ai_tokens: 'monthly_ai_tokens_used',
}

const DENIED_RESULT: UsageLimitResult = {
  allowed: false,
  used: 0,
  limit: 0,
  remaining: 0,
}

/**
 * ユーザーの使用量が上限内かチェック（副作用なし）
 */
export async function checkUsageLimit(
  supabase: SupabaseClient,
  userId: string,
  resourceType: ResourceType,
  ctx?: ExecutionContext
): Promise<UsageLimitResult> {
  if (resourceType === 'stt' || resourceType === 'ai_tokens') {
    return checkAndReserveUsage(supabase, userId, resourceType, 0, ctx)
  }

  // documents: 拒否キャッシュチェック
  const denied = await isUsageDenied(userId, resourceType)
  if (denied) {
    return { ...DENIED_RESULT }
  }

  // ドキュメント数はリアルタイムでカウント
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error('User not found')
  }

  const { data: plan, error: planError } = await supabase
    .from('subscription_plans')
    .select('max_documents')
    .eq('id', profile.subscription_tier)
    .single()

  if (planError || !plan) {
    throw new Error('Subscription plan not found')
  }

  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  const used = count ?? 0
  const limit = plan.max_documents
  const remaining = Math.max(0, limit - used)
  const allowed = used < limit

  if (!allowed) {
    await cacheDeniedResult(userId, resourceType, ctx)
  }

  return { allowed, used, limit, remaining }
}

/**
 * アトミックな使用量チェック＋予約
 */
export async function checkAndReserveUsage(
  supabase: SupabaseClient,
  userId: string,
  resourceType: 'stt' | 'ai_tokens',
  reserveAmount: number,
  ctx?: ExecutionContext
): Promise<UsageLimitResult> {
  // 拒否キャッシュチェック: 上限到達済みなら即座に拒否
  const denied = await isUsageDenied(userId, resourceType)
  if (denied) {
    return { ...DENIED_RESULT }
  }

  const column = RESOURCE_COLUMN_MAP[resourceType]

  const { data, error } = await supabase.rpc('check_and_reserve_usage', {
    p_user_id: userId,
    p_column_name: column,
    p_reserve_amount: Math.ceil(reserveAmount),
  })

  if (error) {
    throw new Error(`Usage check failed: ${error.message}`)
  }

  if (!data || data.length === 0) {
    throw new Error('Usage check returned no data')
  }

  const row = data[0]
  const result: UsageLimitResult = {
    allowed: row.allowed,
    used: row.used_amount,
    limit: row.limit_amount,
    remaining: row.remaining_amount,
  }

  // 拒否結果をキャッシュ（30秒TTL）
  if (!result.allowed) {
    await cacheDeniedResult(userId, resourceType, ctx)
  }

  return result
}

/**
 * 予約量と実際の使用量の差分を調整
 */
export async function adjustReservedUsage(
  supabase: SupabaseClient,
  userId: string,
  resourceType: 'stt' | 'ai_tokens',
  reservedAmount: number,
  actualAmount: number
): Promise<void> {
  if (reservedAmount === actualAmount) return

  const column = RESOURCE_COLUMN_MAP[resourceType]

  const { error } = await supabase.rpc('adjust_reserved_usage', {
    p_user_id: userId,
    p_column_name: column,
    p_reserved_amount: Math.ceil(reservedAmount),
    p_actual_amount: Math.ceil(actualAmount),
  })

  if (error) {
    console.error('Failed to adjust reserved usage:', error.message)
  }
}

/**
 * 使用量を記録
 */
export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  usageType: UsageType,
  quantity: number,
  unit: string,
  metadata?: Record<string, unknown>,
  skipIncrement = false
): Promise<void> {
  if (quantity <= 0) return

  if (!skipIncrement) {
    const columnMap: Record<string, string> = {
      stt: 'monthly_stt_minutes_used',
      ai_completion: 'monthly_ai_tokens_used',
      embedding: 'monthly_ai_tokens_used',
      storage: 'monthly_storage_bytes_used',
    }

    const column = columnMap[usageType]
    if (column) {
      const { error: updateError } = await supabase.rpc('increment_column', {
        table_name: 'profiles',
        column_name: column,
        increment_by: Math.ceil(quantity),
        row_id: userId,
      })

      if (updateError) {
        throw new Error(`Failed to increment usage counter: ${updateError.message}`)
      }
    }
  }

  await supabase.from('usage_logs').insert({
    user_id: userId,
    usage_type: usageType,
    quantity,
    unit,
    metadata: metadata ?? null,
  })
}
