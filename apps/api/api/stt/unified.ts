/**
 * STT 統合エンドポイント (Phase 8)
 * POST /api/stt/token - Deepgram 一時トークン発行
 * POST /api/stt/usage - STT 使用量報告
 *
 * JWT 認証必須。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { checkUsageLimit, hasCustomApiKey, recordUsage } from '../../lib/usage'
import { generateTemporaryToken, DEFAULT_STT_CONFIG } from '../../lib/deepgram'
import { getRoute } from '../../lib/routing'

const MAX_SESSION_MINUTES = 120

async function handleToken(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  const hasCustomKey = await hasCustomApiKey(userId, 'deepgram')
  if (hasCustomKey) {
    return res.status(200).json({
      success: true,
      useCustomKey: true,
    })
  }

  const usage = await checkUsageLimit(userId, 'stt')
  if (!usage.allowed) {
    return res.status(429).json({
      error: 'STT monthly limit exceeded',
      usage: {
        used: usage.used,
        limit: usage.limit,
        remaining: 0,
      },
    })
  }

  const { token, expiresIn } = await generateTemporaryToken(600)

  return res.status(200).json({
    success: true,
    token,
    expiresIn,
    config: DEFAULT_STT_CONFIG,
    usage: {
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
    },
  })
}

async function handleUsage(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub
  const { minutes } = req.body || {}

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

  const cappedMinutes = Math.ceil(minutes)

  await recordUsage(userId, 'stt', cappedMinutes, 'minutes', {
    reportedMinutes: minutes,
    cappedMinutes,
  })

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
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  try {
    const route = getRoute(req)

    switch (route) {
      case 'token':
        return handleToken(req, res)
      case 'usage':
        return handleUsage(req, res)
      default:
        return res.status(404).json({ error: 'Not found' })
    }
  } catch (error) {
    console.error('STT error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
