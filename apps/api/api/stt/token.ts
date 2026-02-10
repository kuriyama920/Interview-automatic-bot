/**
 * STT 一時トークン発行エンドポイント (Phase 8)
 * POST /api/stt/token
 *
 * JWT 認証必須。Deepgram 一時トークン（10分有効）を発行。
 * 使用量上限チェック済み。カスタムキーユーザーには useCustomKey を返却。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { checkUsageLimit, hasCustomApiKey } from '../../lib/usage'
import { generateTemporaryToken, DEFAULT_STT_CONFIG } from '../../lib/deepgram'

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

    // カスタムキーを持っているか確認
    const hasCustomKey = await hasCustomApiKey(userId, 'deepgram')
    if (hasCustomKey) {
      return res.status(200).json({
        success: true,
        useCustomKey: true,
      })
    }

    // 使用量上限チェック
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

    // Deepgram 一時トークンを発行（10分有効）
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
  } catch (error) {
    console.error('STT token error:', error)
    return res.status(500).json({ error: 'Failed to generate STT token' })
  }
}
