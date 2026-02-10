/**
 * 使用量追跡・制限チェック (Phase 8)
 *
 * checkUsageLimit(): 使用量上限チェック（副作用なし）
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

/**
 * ユーザーの使用量が上限内かチェック（副作用なし）
 */
export async function checkUsageLimit(
  userId: string,
  resourceType: ResourceType
): Promise<UsageLimitResult> {
  // プロフィールの使用量と tier を取得
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('subscription_tier, monthly_stt_minutes_used, monthly_ai_tokens_used')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error('User not found')
  }

  // プランの制限値を取得
  const { data: plan, error: planError } = await supabaseAdmin
    .from('subscription_plans')
    .select('stt_minutes_monthly, ai_tokens_monthly, max_documents')
    .eq('id', profile.subscription_tier)
    .single()

  if (planError || !plan) {
    throw new Error('Subscription plan not found')
  }

  let used: number
  let limit: number

  switch (resourceType) {
    case 'stt':
      used = profile.monthly_stt_minutes_used
      limit = plan.stt_minutes_monthly
      break
    case 'ai_tokens':
      used = profile.monthly_ai_tokens_used
      limit = plan.ai_tokens_monthly
      break
    case 'documents': {
      // ドキュメント数はリアルタイムでカウント
      const { count } = await supabaseAdmin
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('deleted_at', null)
      used = count ?? 0
      limit = plan.max_documents
      break
    }
  }

  const remaining = Math.max(0, limit - used)

  return {
    allowed: used < limit,
    used,
    limit,
    remaining,
  }
}

/**
 * 使用量を記録
 * 1. profiles テーブルのカウンターを increment
 * 2. usage_logs テーブルに詳細レコードを insert
 */
export async function recordUsage(
  userId: string,
  usageType: UsageType,
  quantity: number,
  unit: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (quantity <= 0) return

  // 1. profiles カウンターを increment
  const columnMap: Record<string, string> = {
    stt: 'monthly_stt_minutes_used',
    ai_completion: 'monthly_ai_tokens_used',
    embedding: 'monthly_ai_tokens_used',
    storage: 'monthly_storage_bytes_used',
  }

  const column = columnMap[usageType]
  if (column) {
    // Atomic increment: SQL の SET column = column + quantity で競合安全
    const { error: updateError } = await supabaseAdmin.rpc('increment_column', {
      table_name: 'profiles',
      column_name: column,
      increment_by: Math.ceil(quantity),
      row_id: userId,
    })

    // RPC 未作成時のフォールバック（初回デプロイ前）
    if (updateError) {
      console.warn('increment_column RPC not available, falling back to non-atomic update:', updateError.message)
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select(column)
        .eq('id', userId)
        .single()

      if (profile) {
        const currentValue = (profile as Record<string, number>)[column] ?? 0
        await supabaseAdmin
          .from('profiles')
          .update({ [column]: currentValue + Math.ceil(quantity) })
          .eq('id', userId)
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
