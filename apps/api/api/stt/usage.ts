/**
 * STT 使用量報告エンドポイント (Phase 8)
 * POST /api/stt/usage
 *
 * JWT 認証必須。STT セッション終了時にクライアントが使用分数を報告。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { recordUsage, checkUsageLimit } from '../../lib/usage'

const MAX_SESSION_MINUTES = 120

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const jwtPayload = getUserFromRequest(req)
    if (!jwtPayload) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const userId = jwtPayload.sub
    const { minutes } = req.body || {}

    // バリデーション（型・範囲・有限数チェック）
    if (
      typeof minutes !== 'number' ||
      !Number.isFinite(minutes) ||
      minutes <= 0 ||
      minutes > MAX_SESSION_MINUTES
    ) {
      return res.status(400).json({
        error: `minutes must be a positive number up to ${MAX_SESSION_MINUTES}`,
      })
    }

    // 分単位に切り上げ
    const cappedMinutes = Math.ceil(minutes)

    // 使用量を記録
    await recordUsage(userId, 'stt', cappedMinutes, 'minutes', {
      reportedMinutes: minutes,
      cappedMinutes,
    })

    // 更新後の使用量を返却
    const usage = await checkUsageLimit(userId, 'stt')

    return res.status(200).json({
      success: true,
      recorded: cappedMinutes,
      usage: {
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
      },
    })
  } catch (error) {
    console.error('STT usage report error:', error)
    return res.status(500).json({ error: 'Failed to record STT usage' })
  }
}
