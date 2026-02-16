/**
 * 認証統合エンドポイント
 * GET /api/auth/google - OAuth認証開始
 * GET /api/auth/callback - OAuthコールバック
 * POST|GET /api/auth/session - セッション作成・ポーリング
 * GET /api/auth/me - ユーザー情報取得
 * PUT /api/auth/profile - 面接プロフィール更新
 *
 * JWT認証は /me, /profile で必須。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import {
  generateGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  generateJWT,
  getUserFromRequest,
} from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { isAllowedOrigin } from '../../lib/allowed-origins'
import { getBaseUrl } from '../../lib/url'
import { showSuccessPage, showErrorPage } from '../../lib/auth-pages'
import { getRoute } from '../../lib/routing'
import { validateInterviewProfile } from '../../lib/profile'
import crypto from 'crypto'

// State data stored in Supabase
interface StateData {
  redirectUri: string | null
  sessionId: string | null
  expiresAt: Date
}

// --- OAuth State helpers ---

async function getOAuthState(state: string): Promise<StateData | null> {
  const { data, error } = await supabaseAdmin
    .from('oauth_states')
    .select('redirect_uri, session_id, expires_at')
    .eq('state', state)
    .single()

  if (error || !data) return null

  const expiresAt = new Date(data.expires_at)
  if (expiresAt < new Date()) return null

  return {
    redirectUri: data.redirect_uri,
    sessionId: data.session_id,
    expiresAt,
  }
}

async function deleteOAuthState(state: string): Promise<void> {
  await supabaseAdmin.from('oauth_states').delete().eq('state', state)
}

// --- /api/auth/google ---

async function handleGoogle(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { redirect_uri, session_id } = req.query

  const sessionId = typeof session_id === 'string' ? session_id : null
  const ALLOWED_REDIRECT_URIS = ['interview-bot://auth/callback']
  const appRedirectUri = sessionId
    ? null
    : typeof redirect_uri === 'string' && ALLOWED_REDIRECT_URIS.includes(redirect_uri)
      ? redirect_uri
      : 'interview-bot://auth/callback'

  const state = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

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

  void supabaseAdmin.rpc('cleanup_expired_oauth_states')

  const apiCallbackUrl = `${getBaseUrl(req)}/api/auth/callback`
  const authUrl = generateGoogleAuthUrl(apiCallbackUrl, state)

  res.redirect(302, authUrl)
}

// --- /api/auth/callback ---

async function upsertUser(googleUser: { id: string; email: string; name: string; picture: string }) {
  const { data: user, error } = await supabaseAdmin.rpc('upsert_user_profile', {
    p_email: googleUser.email,
    p_display_name: googleUser.name,
    p_avatar_url: googleUser.picture,
  })

  if (error) throw error
  if (!user) throw new Error('Failed to upsert user')

  await supabaseAdmin
    .from('user_settings')
    .upsert({
      user_id: user.id,
      theme: 'dark',
      auto_generate_ai: true,
      ai_model: 'gpt-5-mini',
      ai_temperature: 0.7,
      ai_max_tokens: 1000,
      context_min_similarity: 0.7,
      context_top_k: 3,
    }, { onConflict: 'user_id' })

  return user
}

async function handleCallbackError(
  res: VercelResponse,
  stateData: { sessionId: string | null; redirectUri: string | null } | null,
  error: string
) {
  if (stateData?.sessionId) {
    const { data: session } = await supabaseAdmin
      .from('auth_sessions')
      .select('return_url')
      .eq('id', stateData.sessionId)
      .single()

    await supabaseAdmin.from('auth_sessions').update({
      status: 'error',
      error,
      completed_at: new Date().toISOString(),
    }).eq('id', stateData.sessionId)

    if (session?.return_url && isAllowedOrigin(session.return_url)) {
      const redirectUrl = new URL(session.return_url)
      redirectUrl.searchParams.set('auth_error', 'authentication_failed')
      res.setHeader('Referrer-Policy', 'no-referrer')
      return res.redirect(302, redirectUrl.toString())
    }

    return showErrorPage(res, error)
  }

  const redirectUri = stateData?.redirectUri || 'interview-bot://auth/callback'
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  return res.redirect(302, url.toString())
}

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { code, state, error } = req.query

  const stateData = state ? await getOAuthState(state as string) : null

  if (error) {
    return handleCallbackError(res, stateData, `OAuth error: ${error}`)
  }

  if (!code || !state) {
    return handleCallbackError(res, stateData, 'Missing code or state')
  }

  if (!stateData) {
    return handleCallbackError(res, null, 'Invalid or expired state')
  }

  await deleteOAuthState(state as string)

  const apiCallbackUrl = `${getBaseUrl(req)}/api/auth/callback`
  const tokens = await exchangeCodeForTokens(code as string, apiCallbackUrl)
  const googleUser = await getGoogleUserInfo(tokens.access_token)
  const user = await upsertUser(googleUser)

  const jwt = generateJWT({
    sub: user.id,
    email: user.email,
    name: user.display_name || googleUser.name,
    picture: user.avatar_url || googleUser.picture,
  })

  const userData = {
    id: user.id,
    email: user.email,
    name: user.display_name,
    picture: user.avatar_url,
    subscriptionTier: user.subscription_tier,
  }

  if (stateData.sessionId) {
    const { data: session } = await supabaseAdmin
      .from('auth_sessions')
      .select('return_url')
      .eq('id', stateData.sessionId)
      .single()

    await supabaseAdmin.from('auth_sessions').update({
      status: 'completed',
      token: jwt,
      user_data: userData,
      completed_at: new Date().toISOString(),
    }).eq('id', stateData.sessionId)

    if (session?.return_url && isAllowedOrigin(session.return_url)) {
      const redirectUrl = new URL(session.return_url)
      redirectUrl.searchParams.set('session_id', stateData.sessionId)
      res.setHeader('Referrer-Policy', 'no-referrer')
      return res.redirect(302, redirectUrl.toString())
    }

    return showSuccessPage(res, user.display_name || user.email)
  }

  if (stateData.redirectUri) {
    const ALLOWED_REDIRECT_URIS = ['interview-bot://auth/callback']
    if (!ALLOWED_REDIRECT_URIS.includes(stateData.redirectUri)) {
      return handleCallbackError(res, null, 'Invalid redirect URI')
    }

    const redirectUrl = new URL(stateData.redirectUri)
    redirectUrl.searchParams.set('token', jwt)
    redirectUrl.searchParams.set('user', JSON.stringify(userData))
    res.setHeader('Referrer-Policy', 'no-referrer')
    return res.redirect(302, redirectUrl.toString())
  }

  return handleCallbackError(res, null, 'Invalid session configuration')
}

// --- /api/auth/session ---

async function handleCreateSession(req: VercelRequest, res: VercelResponse) {
  const sessionId = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  const { returnUrl } = req.body || {}
  let validatedReturnUrl: string | null = null

  if (returnUrl && typeof returnUrl === 'string') {
    if (!isAllowedOrigin(returnUrl)) {
      return res.status(400).json({ error: 'Invalid returnUrl origin' })
    }
    try {
      const parsed = new URL(returnUrl)
      validatedReturnUrl = `${parsed.origin}${parsed.pathname}${parsed.search}`
    } catch {
      return res.status(400).json({ error: 'Invalid returnUrl format' })
    }
  }

  const { error: dbError } = await supabaseAdmin.from('auth_sessions').insert({
    id: sessionId,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
    return_url: validatedReturnUrl,
  })

  if (dbError) {
    console.error('Failed to create auth session:', dbError)
    return res.status(500).json({ error: 'Failed to create session' })
  }

  void supabaseAdmin.rpc('cleanup_expired_auth_sessions')

  const baseUrl = getBaseUrl(req)
  const authUrl = `${baseUrl}/api/auth/google?session_id=${sessionId}`

  res.status(200).json({
    sessionId,
    authUrl,
    expiresAt: expiresAt.toISOString(),
  })
}

async function handlePollSession(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Session ID required' })
  }

  const { data: consumed } = await supabaseAdmin.rpc('consume_auth_session', {
    p_session_id: id,
  })

  if (consumed && consumed.length > 0) {
    return res.status(200).json({
      status: 'completed',
      token: consumed[0].session_token,
      user: consumed[0].session_user_data,
    })
  }

  // RPC失敗時のフォールバック: セッションを直接確認
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('auth_sessions')
    .select('status, token, user_data, expires_at, error')
    .eq('id', id)
    .single()

  if (sessionError || !session) {
    return res.status(404).json({ error: 'Session not found' })
  }

  if (new Date(session.expires_at) < new Date()) {
    return res.status(410).json({ status: 'expired', error: 'Session expired' })
  }

  if (session.status === 'pending') {
    return res.status(200).json({ status: 'pending' })
  }

  // completed / consumed: RPCが失敗してもトークンを返せるようにする
  if ((session.status === 'completed' || session.status === 'consumed') && session.token) {
    return res.status(200).json({
      status: 'completed',
      token: session.token,
      user: session.user_data,
    })
  }

  return res.status(200).json({
    status: 'error',
    error: session.error || 'Authentication failed',
  })
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'POST') {
    return handleCreateSession(req, res)
  }
  if (req.method === 'GET') {
    return handlePollSession(req, res)
  }
  return res.status(405).json({ error: 'Method not allowed' })
}

// --- /api/auth/me ---

async function handleMe(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: user, error: userError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', jwtPayload.sub)
    .single()

  if (userError || !user) {
    return res.status(401).json({ error: 'User not found' })
  }

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
      interviewProfile: user.interview_profile || null,
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
}

// --- /api/auth/profile ---

async function handleProfile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const validation = validateInterviewProfile(req.body)
  if ('error' in validation) {
    return res.status(400).json({ success: false, error: validation.error })
  }

  const { error: updateError } = await supabaseAdmin
    .from('profiles')
    .update({ interview_profile: validation })
    .eq('id', jwtPayload.sub)

  if (updateError) {
    console.error('Failed to update interview profile:', updateError)
    return res.status(500).json({ success: false, error: 'Failed to save profile' })
  }

  return res.status(200).json({ success: true, interviewProfile: validation })
}

// --- メインハンドラー ---

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const route = getRoute(req)
  const origin = req.headers.origin as string | undefined

  // CORS: session, me, profile のみ適用（google/callback はブラウザリダイレクト）
  if (route === 'session' || route === 'me' || route === 'profile') {
    if (req.method === 'OPTIONS') {
      return handlePreflight(res, origin)
    }
    const isAllowed = setCorsHeaders(res, origin)
    if ((route === 'me' || route === 'profile') && !isAllowed && origin) {
      return res.status(403).json({ error: 'Origin not allowed' })
    }
  }

  try {
    switch (route) {
      case 'google':
        return handleGoogle(req, res)
      case 'callback':
        return handleCallback(req, res)
      case 'session':
        return handleSession(req, res)
      case 'me':
        return handleMe(req, res)
      case 'profile':
        return handleProfile(req, res)
      default:
        return res.status(404).json({ error: 'Not found' })
    }
  } catch (error) {
    console.error('Auth error:', error)

    // callback エラーの場合はエラーページを表示
    if (route === 'callback') {
      return handleCallbackError(res, null, 'Authentication failed')
    }

    return res.status(500).json({ error: 'Internal server error' })
  }
}
