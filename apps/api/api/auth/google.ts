/**
 * Google OAuth 認証開始エンドポイント
 * GET /api/auth/google
 *
 * Electron アプリからこのURLを開いてOAuth認証を開始
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { generateGoogleAuthUrl } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import crypto from 'crypto'

// State data stored in Supabase
interface StateData {
  redirectUri: string
  expiresAt: Date
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Electronアプリからのリダイレクト先を取得
    const { redirect_uri } = req.query
    const appRedirectUri =
      typeof redirect_uri === 'string' ? redirect_uri : 'interview-bot://auth/callback'

    // CSRFトークンを生成
    const state = crypto.randomBytes(32).toString('hex')

    // 有効期限（5分後）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

    // Supabaseにstateを保存
    const { error: insertError } = await supabaseAdmin.from('oauth_states').insert({
      state,
      redirect_uri: appRedirectUri,
      expires_at: expiresAt.toISOString(),
    })

    if (insertError) {
      console.error('Failed to save OAuth state:', insertError)
      return res.status(500).json({ error: 'Failed to initiate OAuth' })
    }

    // 期限切れのstateをクリーンアップ（非同期、エラーは無視）
    supabaseAdmin.rpc('cleanup_expired_oauth_states').catch(() => {})

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

function getBaseUrl(req: VercelRequest): string {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${protocol}://${host}`
}

// Helper functions for state store operations
export async function getOAuthState(state: string): Promise<StateData | null> {
  const { data, error } = await supabaseAdmin
    .from('oauth_states')
    .select('redirect_uri, expires_at')
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
    expiresAt,
  }
}

export async function deleteOAuthState(state: string): Promise<void> {
  await supabaseAdmin.from('oauth_states').delete().eq('state', state)
}
