/**
 * 認証ルート
 * GET  /api/auth/google   - OAuth認証開始
 * GET  /api/auth/callback  - OAuthコールバック
 * POST /api/auth/session   - セッション作成
 * GET  /api/auth/session   - セッションポーリング
 * GET  /api/auth/me        - ユーザー情報取得
 * PUT  /api/auth/profile   - 面接プロフィール更新
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import {
  generateGoogleAuthUrl,
  exchangeCodeForTokens,
  getGoogleUserInfo,
  generateJWT,
} from '../lib/auth'
import { isAllowedOrigin } from '../lib/allowed-origins'
import { getBaseUrl } from '../lib/url'
import { getSuccessPageHtml, getErrorPageHtml } from '../lib/auth-pages'
import { validateInterviewProfile } from '../lib/profile'
import { invalidateProfileCache } from '../lib/profile-cache'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// --- OAuth State helpers ---

interface StateData {
  redirectUri: string | null
  sessionId: string | null
  expiresAt: Date
}

async function getOAuthState(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  state: string
): Promise<StateData | null> {
  const { data, error } = await supabase
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

async function deleteOAuthState(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  state: string
): Promise<void> {
  await supabase.from('oauth_states').delete().eq('state', state)
}

// --- User upsert ---

async function upsertUser(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  googleUser: { id: string; email: string; name: string; picture: string }
) {
  const { data: user, error } = await supabase.rpc('upsert_user_profile', {
    p_email: googleUser.email,
    p_display_name: googleUser.name,
    p_avatar_url: googleUser.picture,
  })

  if (error) throw error
  if (!user) throw new Error('Failed to upsert user')

  await supabase.from('user_settings').upsert(
    {
      user_id: user.id,
      theme: 'dark',
      auto_generate_ai: true,
      ai_model: 'gpt-5-mini',
      ai_temperature: 0.7,
      ai_max_tokens: 1000,
      context_min_similarity: 0.7,
      context_top_k: 3,
    },
    { onConflict: 'user_id' }
  )

  return user
}

// --- Callback error handling ---

async function handleCallbackError(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  stateData: { sessionId: string | null; redirectUri: string | null } | null,
  error: string
): Promise<Response> {
  if (stateData?.sessionId) {
    const { data: session } = await supabase
      .from('auth_sessions')
      .select('return_url')
      .eq('id', stateData.sessionId)
      .single()

    await supabase
      .from('auth_sessions')
      .update({
        status: 'error',
        error,
        completed_at: new Date().toISOString(),
      })
      .eq('id', stateData.sessionId)

    if (session?.return_url && isAllowedOrigin(session.return_url)) {
      const redirectUrl = new URL(session.return_url)
      redirectUrl.searchParams.set('auth_error', 'authentication_failed')
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl.toString(),
          'Referrer-Policy': 'no-referrer',
        },
      })
    }

    return new Response(getErrorPageHtml(error), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const redirectUri = stateData?.redirectUri || 'interview-bot://auth/callback'
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString() },
  })
}

// --- /api/auth/google ---

app.get('/google', async (c) => {
  const supabase = createSupabaseAdmin(c.env)

  const sessionId = c.req.query('session_id') || null
  const redirectUriParam = c.req.query('redirect_uri')

  const ALLOWED_REDIRECT_URIS = ['interview-bot://auth/callback']
  const appRedirectUri = sessionId
    ? null
    : redirectUriParam && ALLOWED_REDIRECT_URIS.includes(redirectUriParam)
      ? redirectUriParam
      : 'interview-bot://auth/callback'

  // Workers: crypto.randomUUID() + hex
  const stateArray = new Uint8Array(32)
  crypto.getRandomValues(stateArray)
  const state = Array.from(stateArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  const { error: insertError } = await supabase.from('oauth_states').insert({
    state,
    redirect_uri: appRedirectUri,
    session_id: sessionId,
    expires_at: expiresAt.toISOString(),
  })

  if (insertError) {
    console.error('Failed to save OAuth state:', insertError)
    return c.json({ error: 'Failed to initiate OAuth' }, 500)
  }

  void supabase.rpc('cleanup_expired_oauth_states')

  const apiCallbackUrl = `${getBaseUrl(c.req.raw)}/api/auth/callback`
  const authUrl = generateGoogleAuthUrl(apiCallbackUrl, state, c.env)

  return c.redirect(authUrl, 302)
})

// --- /api/auth/callback ---

app.get('/callback', async (c) => {
  const supabase = createSupabaseAdmin(c.env)

  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')

  const stateData = state ? await getOAuthState(supabase, state) : null

  if (error) {
    return handleCallbackError(supabase, stateData, `OAuth error: ${error}`)
  }

  if (!code || !state) {
    return handleCallbackError(supabase, stateData, 'Missing code or state')
  }

  if (!stateData) {
    return handleCallbackError(supabase, null, 'Invalid or expired state')
  }

  await deleteOAuthState(supabase, state)

  const apiCallbackUrl = `${getBaseUrl(c.req.raw)}/api/auth/callback`
  const tokens = await exchangeCodeForTokens(code, apiCallbackUrl, c.env)
  const googleUser = await getGoogleUserInfo(tokens.access_token)
  const user = await upsertUser(supabase, googleUser)

  const jwt = await generateJWT(
    { sub: user.id },
    c.env.JWT_SECRET
  )

  const userData = {
    id: user.id,
    email: user.email,
    name: user.display_name,
    picture: user.avatar_url,
    subscriptionTier: user.subscription_tier,
  }

  if (stateData.sessionId) {
    const { data: session } = await supabase
      .from('auth_sessions')
      .select('return_url')
      .eq('id', stateData.sessionId)
      .single()

    await supabase
      .from('auth_sessions')
      .update({
        status: 'completed',
        token: jwt,
        user_data: userData,
        completed_at: new Date().toISOString(),
      })
      .eq('id', stateData.sessionId)

    if (session?.return_url && isAllowedOrigin(session.return_url)) {
      const redirectUrl = new URL(session.return_url)
      redirectUrl.searchParams.set('session_id', stateData.sessionId)
      return new Response(null, {
        status: 302,
        headers: {
          Location: redirectUrl.toString(),
          'Referrer-Policy': 'no-referrer',
        },
      })
    }

    return c.html(getSuccessPageHtml(user.display_name || user.email))
  }

  if (stateData.redirectUri) {
    const ALLOWED_REDIRECT_URIS = ['interview-bot://auth/callback']
    if (!ALLOWED_REDIRECT_URIS.includes(stateData.redirectUri)) {
      return handleCallbackError(supabase, null, 'Invalid redirect URI')
    }

    const redirectUrl = new URL(stateData.redirectUri)
    redirectUrl.searchParams.set('status', 'completed')
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        'Referrer-Policy': 'no-referrer',
      },
    })
  }

  return handleCallbackError(supabase, null, 'Invalid session configuration')
})

// --- /api/auth/session ---

app.post('/session', async (c) => {
  const supabase = createSupabaseAdmin(c.env)

  const body = await c.req.json<{ returnUrl?: string }>().catch((): { returnUrl?: string } => ({}))
  const { returnUrl } = body

  let validatedReturnUrl: string | null = null
  if (returnUrl && typeof returnUrl === 'string') {
    if (!isAllowedOrigin(returnUrl)) {
      return c.json({ error: 'Invalid returnUrl origin' }, 400)
    }
    try {
      const parsed = new URL(returnUrl)
      validatedReturnUrl = `${parsed.origin}${parsed.pathname}${parsed.search}`
    } catch {
      return c.json({ error: 'Invalid returnUrl format' }, 400)
    }
  }

  const idArray = new Uint8Array(32)
  crypto.getRandomValues(idArray)
  const sessionId = Array.from(idArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)

  const { error: dbError } = await supabase.from('auth_sessions').insert({
    id: sessionId,
    status: 'pending',
    expires_at: expiresAt.toISOString(),
    return_url: validatedReturnUrl,
  })

  if (dbError) {
    console.error('Failed to create auth session:', dbError)
    return c.json({ error: 'Failed to create session' }, 500)
  }

  void supabase.rpc('cleanup_expired_auth_sessions')

  const baseUrl = getBaseUrl(c.req.raw)
  const authUrl = `${baseUrl}/api/auth/google?session_id=${sessionId}`

  return c.json({
    sessionId,
    authUrl,
    expiresAt: expiresAt.toISOString(),
  })
})

app.get('/session', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const id = c.req.query('id')

  if (!id) {
    return c.json({ error: 'Session ID required' }, 400)
  }

  const { data: consumed } = await supabase.rpc('consume_auth_session', {
    p_session_id: id,
  })

  if (consumed && consumed.length > 0) {
    return c.json({
      status: 'completed',
      token: consumed[0].session_token,
      user: consumed[0].session_user_data,
    })
  }

  const { data: session, error: sessionError } = await supabase
    .from('auth_sessions')
    .select('status, token, user_data, expires_at, error')
    .eq('id', id)
    .single()

  if (sessionError || !session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  if (new Date(session.expires_at) < new Date()) {
    return c.json({ status: 'expired', error: 'Session expired' }, 410)
  }

  if (session.status === 'pending') {
    return c.json({ status: 'pending' })
  }

  // セキュリティ修正: フォールバックパスではトークンを返さない
  // トークンは atomic な consume_auth_session RPC 経由でのみ返却する
  // これにより複数回のトークン取得（リプレイ攻撃）を防止
  if (session.status === 'completed') {
    return c.json({
      status: 'completed',
      message: 'Session completed but token must be retrieved atomically. Please retry.',
    })
  }

  return c.json({
    status: 'error',
    error: session.error || 'Authentication failed',
  })
})

// --- /api/auth/refresh (JWT required) ---

app.post('/refresh', authRequired, async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  // Verify user still exists in database
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return c.json({ error: 'User not found' }, 401)
  }

  // Generate fresh JWT with sub only (no PII)
  const newToken = await generateJWT(
    { sub: user.id },
    c.env.JWT_SECRET
  )

  return c.json({ token: newToken })
})

// --- /api/auth/me (JWT required) ---

app.get('/me', authRequired, async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    return c.json({ error: 'User not found' }, 401)
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return c.json({
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
        }
      : null,
  })
})

// --- /api/auth/profile (JWT required) ---

app.put('/profile', authRequired, async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json()

  const validation = validateInterviewProfile(body)
  if ('error' in validation) {
    return c.json({ success: false, error: validation.error }, 400)
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ interview_profile: validation })
    .eq('id', userId)

  if (updateError) {
    console.error('Failed to update interview profile:', updateError)
    return c.json({ success: false, error: 'Failed to save profile' }, 500)
  }

  // キャッシュ無効化（失敗しても更新自体は成功扱い）
  await invalidateProfileCache(userId).catch(() => {})

  return c.json({ success: true, interviewProfile: validation })
})

export default app
