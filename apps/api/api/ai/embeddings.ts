/**
 * Embeddings 生成プロキシエンドポイント (Phase 8)
 * POST /api/ai/embeddings
 *
 * JWT 認証必須。テキストの Embedding ベクトルを生成。
 * 使用量追跡済み。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { checkUsageLimit, recordUsage, hasCustomApiKey } from '../../lib/usage'
import { generateEmbedding, generateEmbeddings } from '../../lib/openai'

const MAX_TEXTS = 20
const MAX_TEXT_LENGTH = 8000

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
    const { text, texts } = req.body || {}

    // バリデーション: text または texts のいずれかが必要
    if (!text && !texts) {
      return res.status(400).json({ error: 'text or texts is required' })
    }

    let inputTexts: string[]

    if (text) {
      if (typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'text must be a non-empty string' })
      }
      if (text.length > MAX_TEXT_LENGTH) {
        return res.status(400).json({ error: `text must be less than ${MAX_TEXT_LENGTH} characters` })
      }
      inputTexts = [text]
    } else {
      if (!Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ error: 'texts must be a non-empty array' })
      }
      if (texts.length > MAX_TEXTS) {
        return res.status(400).json({ error: `texts must have at most ${MAX_TEXTS} items` })
      }
      for (const t of texts) {
        if (typeof t !== 'string' || t.trim().length === 0) {
          return res.status(400).json({ error: 'Each text must be a non-empty string' })
        }
        if (t.length > MAX_TEXT_LENGTH) {
          return res.status(400).json({ error: `Each text must be less than ${MAX_TEXT_LENGTH} characters` })
        }
      }
      inputTexts = texts
    }

    // カスタムキーチェック
    const userHasCustomKey = await hasCustomApiKey(userId, 'openai')

    if (!userHasCustomKey) {
      const usage = await checkUsageLimit(userId, 'ai_tokens')
      if (!usage.allowed) {
        return res.status(429).json({
          error: 'AI token monthly limit exceeded',
          usage: { used: usage.used, limit: usage.limit, remaining: 0 },
        })
      }
    }

    // Embedding 生成
    let embeddings: number[][]

    if (inputTexts.length === 1) {
      const embedding = await generateEmbedding(inputTexts[0])
      embeddings = [embedding]
    } else {
      embeddings = await generateEmbeddings(inputTexts)
    }

    // 使用量を記録（概算: 1文字 ≈ 0.5トークン）
    if (!userHasCustomKey) {
      const totalChars = inputTexts.reduce((sum, t) => sum + t.length, 0)
      const estimatedTokens = Math.ceil(totalChars * 0.5)
      await recordUsage(userId, 'embedding', estimatedTokens, 'tokens', {
        textCount: inputTexts.length,
        totalChars,
      })
    }

    return res.status(200).json({
      success: true,
      embeddings,
    })
  } catch (error) {
    console.error('Embeddings error:', error)
    return res.status(500).json({ error: 'Failed to generate embeddings' })
  }
}
