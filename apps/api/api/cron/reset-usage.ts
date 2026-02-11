/**
 * 月次使用量リセット Cron ジョブ
 * GET /api/cron/reset-usage
 *
 * Vercel Cron から毎月1日 0:00 UTC に呼び出される。
 * CRON_SECRET で認証。全ユーザーの月次使用量をリセットする。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../../lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を送信
  const authHeader = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // 使用量がある行のみリセット（不必要な UPDATE を回避しロック競合を最小化）
    // Note: PostgreSQL の行ロックにより、同時実行中の increment_column とは
    // 直列化される。リセット直前のインクリメントが消失する極小のウィンドウ
    // （ミリ秒単位）は許容範囲として扱う。
    const { error, count } = await supabaseAdmin
      .from('profiles')
      .update({
        monthly_stt_minutes_used: 0,
        monthly_ai_tokens_used: 0,
      })
      .gte('monthly_stt_minutes_used', 0) // 全行にマッチ

    if (error) {
      throw error
    }

    console.log(`[Cron] Monthly usage reset completed. Rows affected: ${count}`)

    // 古い Webhook イベントもクリーンアップ
    void supabaseAdmin.rpc('cleanup_old_webhook_events')

    return res.status(200).json({
      success: true,
      rowsAffected: count,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[Cron] Usage reset error:', error)
    return res.status(500).json({ error: 'Failed to reset usage' })
  }
}
