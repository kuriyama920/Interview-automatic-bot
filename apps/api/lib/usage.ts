/**
 * 使用量追跡・制限チェック (Phase 8)
 *
 * checkUsageLimit(): 使用量上限チェック（副作用なし）
 * checkAndReserveUsage(): アトミックな使用量チェック＋予約（同時使用安全）
 * adjustReservedUsage(): 予約量と実際の使用量の差分を調整
 * recordUsage(): 使用量記録（profiles カウンター + usage_logs）
 */

import { supabaseAdmin } from './supabase'

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

/**
 * ユーザーの使用量が上限内かチェック（副作用なし）
 * ドキュメント数チェックなど、予約不要な場面で使用
 */
export async function checkUsageLimit(
  userId: string,
  resourceType: ResourceType
): Promise<UsageLimitResult> {
  // stt, ai_tokens はアトミック版を使用（予約量0でチェックのみ）
  if (resourceType === 'stt' || resourceType === 'ai_tokens') {
    return checkAndReserveUsage(userId, resourceType, 0)
  }

  // ドキュメント数はリアルタイムでカウント
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error('User not found')
  }

  const { data: plan, error: planError } = await supabaseAdmin
    .from('subscription_plans')
    .select('max_documents')
    .eq('id', profile.subscription_tier)
    .single()

  if (planError || !plan) {
    throw new Error('Subscription plan not found')
  }

  const { count } = await supabaseAdmin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null)

  const used = count ?? 0
  const limit = plan.max_documents
  const remaining = Math.max(0, limit - used)

  return { allowed: used < limit, used, limit, remaining }
}

/**
 * アトミックな使用量チェック＋予約
 * FOR UPDATE ロックでレースコンディションを防止。
 * reserveAmount > 0 の場合、チェックと同時にカウンターをインクリメント。
 */
export async function checkAndReserveUsage(
  userId: string,
  resourceType: 'stt' | 'ai_tokens',
  reserveAmount: number
): Promise<UsageLimitResult> {
  const column = RESOURCE_COLUMN_MAP[resourceType]

  const { data, error } = await supabaseAdmin.rpc('check_and_reserve_usage', {
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
  return {
    allowed: row.allowed,
    used: row.used_amount,
    limit: row.limit_amount,
    remaining: row.remaining_amount,
  }
}

/**
 * 予約量と実際の使用量の差分を調整
 * ストリーミング完了後に実際のトークン数が判明した際に使用。
 */
export async function adjustReservedUsage(
  userId: string,
  resourceType: 'stt' | 'ai_tokens',
  reservedAmount: number,
  actualAmount: number
): Promise<void> {
  if (reservedAmount === actualAmount) return

  const column = RESOURCE_COLUMN_MAP[resourceType]

  const { error } = await supabaseAdmin.rpc('adjust_reserved_usage', {
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
 * 1. profiles テーブルのカウンターを atomic increment
 * 2. usage_logs テーブルに詳細レコードを insert
 *
 * Note: checkAndReserveUsage で予約済みの場合はカウンター更新不要。
 *       skipIncrement=true でログのみ記録。
 */
export async function recordUsage(
  userId: string,
  usageType: UsageType,
  quantity: number,
  unit: string,
  metadata?: Record<string, unknown>,
  skipIncrement = false
): Promise<void> {
  if (quantity <= 0) return

  // 1. profiles カウンターを increment（予約済みでなければ）
  if (!skipIncrement) {
    const columnMap: Record<string, string> = {
      stt: 'monthly_stt_minutes_used',
      ai_completion: 'monthly_ai_tokens_used',
      embedding: 'monthly_ai_tokens_used',
      storage: 'monthly_storage_bytes_used',
    }

    const column = columnMap[usageType]
    if (column) {
      const { error: updateError } = await supabaseAdmin.rpc('increment_column', {
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

  // 2. usage_logs に詳細レコードを insert
  await supabaseAdmin.from('usage_logs').insert({
    user_id: userId,
    usage_type: usageType,
    quantity,
    unit,
    metadata: metadata ?? null,
  })
}

/**
 * ユーザーがカスタムAPIキーを持っているか確認
 */
export async function hasCustomApiKey(
  userId: string,
  keyType: 'deepgram' | 'openai'
): Promise<boolean> {
  const column =
    keyType === 'deepgram' ? 'custom_deepgram_api_key' : 'custom_openai_api_key'

  const { data } = await supabaseAdmin
    .from('user_settings')
    .select(column)
    .eq('user_id', userId)
    .single()

  if (!data) return false

  const key = (data as Record<string, string | null>)[column]
  return !!key && key.length > 0
}
