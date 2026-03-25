/**
 * Cron handler: 月次使用量リセット
 * index.ts から抽出してテスタビリティを向上
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResetResult {
  success: boolean
  error?: string
}

/**
 * 全ユーザーの月次使用量をリセット
 */
export async function resetMonthlyUsage(
  supabase: SupabaseClient
): Promise<ResetResult> {
  const { error, count } = await supabase
    .from('profiles')
    .update(
      {
        monthly_stt_minutes_used: 0,
        monthly_ai_tokens_used: 0,
      },
      { count: 'exact' }
    )
    .gte('monthly_stt_minutes_used', 0)

  if (error) {
    return { success: false, error: error.message }
  }

  // 拒否キャッシュ（TTL 30秒）は月次リセット後に自然消滅するため、
  // 個別クリアは不要。リセット後最大30秒間は旧拒否キャッシュが残存しうるが、
  // ユーザー体感への影響は無視できるレベル。
  console.log(`[Cron] Monthly usage reset completed. Rows affected: ${count}`)
  return { success: true }
}

/**
 * 古いWebhookイベントをクリーンアップ
 */
export async function cleanupWebhookEvents(
  supabase: SupabaseClient
): Promise<void> {
  await supabase.rpc('cleanup_old_webhook_events').catch((err: unknown) => {
    console.error('[Cron] Webhook cleanup failed:', err)
  })
}
