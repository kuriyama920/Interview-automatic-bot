/**
 * 現在のユーザー情報取得エンドポイント
 * GET /api/auth/me
 *
 * JWTトークンを検証し、ユーザー情報を返す
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  // CORS プリフライトリクエスト
  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  // CORSヘッダーを設定
  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    // 許可されていないWebオリジンからのリクエスト
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // JWTを検証
    const jwtPayload = getUserFromRequest(req)

    if (!jwtPayload) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // 最新のユーザー情報を取得
    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', jwtPayload.sub)
      .single()

    if (error || !user) {
      return res.status(401).json({ error: 'User not found' })
    }

    // 設定も取得
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.display_name,
        picture: user.avatar_url,
        subscriptionTier: user.subscription_tier,
        subscriptionStatus: user.subscription_status,
        subscriptionPeriodEnd: user.subscription_period_end,
        usage: {
          sttMinutes: user.monthly_stt_minutes_used,
          aiTokens: user.monthly_ai_tokens_used,
          storageBytes: user.monthly_storage_bytes_used,
        },
      },
      settings: settings
        ? {
            theme: settings.theme,
            autoGenerateAI: settings.auto_generate_ai,
            aiModel: settings.ai_model,
            aiTemperature: settings.ai_temperature,
            aiMaxTokens: settings.ai_max_tokens,
            contextMinSimilarity: settings.context_min_similarity,
            contextTopK: settings.context_top_k,
            hasCustomDeepgramKey: !!settings.custom_deepgram_api_key,
            hasCustomOpenaiKey: !!settings.custom_openai_api_key,
          }
        : null,
    })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
