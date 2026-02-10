/**
 * Google OAuth 認証開始エンドポイント
 * GET /api/auth/google
 *
 * Electron アプリからこのURLを開いてOAuth認証を開始
 *
 * クエリパラメータ:
 * - session_id: ポーリング認証フロー用のセッションID（推奨）
 * - redirect_uri: Deep Link用のリダイレクトURI（レガシー）
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { generateGoogleAuthUrl } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { getBaseUrl } from '../../lib/url'
import crypto from 'crypto'

// State data stored in Supabase
interface StateData {
  redirectUri: string | null
  sessionId: string | null
  expiresAt: Date
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { redirect_uri, session_id } = req.query

    // セッションIDまたはリダイレクトURIを取得
    const sessionId = typeof session_id === 'string' ? session_id : null
    const ALLOWED_REDIRECT_URIS = ['interview-bot://auth/callback']
    const appRedirectUri = sessionId
      ? null
      : typeof redirect_uri === 'string' && ALLOWED_REDIRECT_URIS.includes(redirect_uri)
        ? redirect_uri
        : 'interview-bot://auth/callback'

    // CSRFトークンを生成
    const state = crypto.randomBytes(32).toString('hex')

    // 有効期限（5分後）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    // Supabaseにstateを保存（session_idも保存）
    const { error: insertError } = await supabaseAdmin.from('oauth_states').insert({
      state,
      redirect_uri: appRedirectUri,
      session_id: sessionId,
      expires_at: expiresAt.toISOString(),
    })

    if (insertError) {
      console.error('Failed to save OAuth state:', insertError)
      return res.status(500).json({ error: 'Failed to initiate OAuth' })
    }

    // 期限切れのstateをクリーンアップ（非同期、エラーは無視）
    void supabaseAdmin.rpc('cleanup_expired_oauth_states')

    // API側のコールバックURL
    const apiCallbackUrl = `${getBaseUrl(req)}/api/auth/callback`

    // Google OAuth URLにリダイレクト
    const authUrl = generateGoogleAuthUrl(apiCallbackUrl, state)

    res.redirect(302, authUrl)
  } catch (error) {
    console.error('Google auth error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}


// Helper functions for state store operations
export async function getOAuthState(state: string): Promise<StateData | null> {
  const { data, error } = await supabaseAdmin
    .from('oauth_states')
    .select('redirect_uri, session_id, expires_at')
    .eq('state', state)
    .single()

  if (error || !data) {
    return null
  }

  const expiresAt = new Date(data.expires_at)
  if (expiresAt < new Date()) {
    // 期限切れ
    return null
  }

  return {
    redirectUri: data.redirect_uri,
    sessionId: data.session_id,
    expiresAt,
  }
}

export async function deleteOAuthState(state: string): Promise<void> {
  await supabaseAdmin.from('oauth_states').delete().eq('state', state)
}
