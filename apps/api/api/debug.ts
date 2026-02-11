/**
 * デバッグエンドポイント
 * GET /api/debug
 *
 * ⚠️ 開発環境専用 - 本番環境では無効化
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 本番環境では無効化
  if (process.env.VERCEL_ENV === 'production') {
    return res.status(403).json({ error: 'Debug endpoint disabled in production' })
  }

  // 開発環境のみ実行
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'local',
  }

  // 1. Environment check (キー名のみ、値は非公開)
  const openaiKey = process.env.OPENAI_API_KEY || ''
  results.env = {
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasOpenaiApiKey: !!openaiKey,
    hasOpenaiKeyFormat: openaiKey ? openaiKey.startsWith('sk-') : false,
    hasDeepgramApiKey: !!process.env.DEEPGRAM_API_KEY,
  }

  // 2. Test oauth_states table (件数のみ)
  try {
    const { error, count } = await supabaseAdmin
      .from('oauth_states')
      .select('*', { count: 'exact', head: true })

    results.oauth_states = error
      ? { error: error.message }
      : { ok: true, count }
  } catch (e) {
    results.oauth_states = { error: String(e) }
  }

  // 3. Test profiles table (件数のみ、ユーザーデータは非公開)
  try {
    const { error, count } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })

    results.profiles = error ? { error: error.message } : { ok: true, count }
  } catch (e) {
    results.profiles = { error: String(e) }
  }

  // 4. Test user_settings table (件数のみ)
  try {
    const { error, count } = await supabaseAdmin
      .from('user_settings')
      .select('*', { count: 'exact', head: true })

    results.user_settings = error ? { error: error.message } : { ok: true, count }
  } catch (e) {
    results.user_settings = { error: String(e) }
  }

  res.status(200).json(results)
}
