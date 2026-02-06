/**
 * Google OAuth コールバックエンドポイント
 * GET /api/auth/callback
 *
 * Googleからリダイレクトされ、JWTを発行
 * - session_idがある場合: セッションを更新してWebページを表示
 * - redirect_uriがある場合: Deep Linkにリダイレクト（レガシー）
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import {
  exchangeCodeForTokens,
  getGoogleUserInfo,
  generateJWT,
} from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { getOAuthState, deleteOAuthState } from './google'
import crypto from 'crypto'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { code, state, error } = req.query

    // stateを取得（エラーハンドリング用）
    const stateData = state ? await getOAuthState(state as string) : null

    // エラーチェック
    if (error) {
      return handleError(res, stateData, `OAuth error: ${error}`)
    }

    if (!code || !state) {
      return handleError(res, stateData, 'Missing code or state')
    }

    if (!stateData) {
      return handleError(res, null, 'Invalid or expired state')
    }

    // 使用済みのstateを削除
    await deleteOAuthState(state as string)

    // コールバックURL
    const apiCallbackUrl = `${getBaseUrl(req)}/api/auth/callback`

    // トークンを取得
    const tokens = await exchangeCodeForTokens(code as string, apiCallbackUrl)

    // ユーザー情報を取得
    const googleUser = await getGoogleUserInfo(tokens.access_token)

    // Supabaseでユーザーを作成または更新
    const user = await upsertUser(googleUser)

    // JWTを生成
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

    // セッションベースフロー（推奨）
    if (stateData.sessionId) {
      await supabaseAdmin.from('auth_sessions').update({
        status: 'completed',
        token: jwt,
        user_data: userData,
        completed_at: new Date().toISOString(),
      }).eq('id', stateData.sessionId)

      return showSuccessPage(res, user.display_name || user.email)
    }

    // Deep Linkフロー（レガシー）
    if (stateData.redirectUri) {
      const redirectUrl = new URL(stateData.redirectUri)
      redirectUrl.searchParams.set('token', jwt)
      redirectUrl.searchParams.set('user', JSON.stringify(userData))
      return res.redirect(302, redirectUrl.toString())
    }

    // どちらもない場合はエラー
    return handleError(res, null, 'Invalid session configuration')
  } catch (error) {
    console.error('Callback error:', error)
    handleError(res, null, 'Authentication failed')
  }
}

/**
 * ユーザーを作成または更新
 */
async function upsertUser(googleUser: { id: string; email: string; name: string; picture: string }) {
  // 既存ユーザーを検索
  const { data: existingUser } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('email', googleUser.email)
    .single()

  if (existingUser) {
    // 既存ユーザーを更新
    const { data: updatedUser, error } = await supabaseAdmin
      .from('profiles')
      .update({
        display_name: googleUser.name,
        avatar_url: googleUser.picture,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingUser.id)
      .select()
      .single()

    if (error) throw error
    return updatedUser
  }

  // 新規ユーザーを作成
  const { data: newUser, error } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: crypto.randomUUID(),
      email: googleUser.email,
      display_name: googleUser.name,
      avatar_url: googleUser.picture,
      subscription_tier: 'free',
      subscription_status: 'active',
      monthly_stt_minutes_used: 0,
      monthly_ai_tokens_used: 0,
      monthly_storage_bytes_used: 0,
    })
    .select()
    .single()

  if (error) throw error

  // デフォルト設定を作成
  await supabaseAdmin.from('user_settings').insert({
    user_id: newUser.id,
    theme: 'dark',
    auto_generate_ai: true,
    ai_model: 'gpt-4o',
    ai_temperature: 0.7,
    ai_max_tokens: 1000,
    context_min_similarity: 0.7,
    context_top_k: 3,
  })

  return newUser
}

function getBaseUrl(req: VercelRequest): string {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${protocol}://${host}`
}

/**
 * エラーハンドリング
 */
async function handleError(
  res: VercelResponse,
  stateData: { sessionId: string | null; redirectUri: string | null } | null,
  error: string
) {
  // セッションベースの場合はセッションを更新
  if (stateData?.sessionId) {
    await supabaseAdmin.from('auth_sessions').update({
      status: 'error',
      error,
      completed_at: new Date().toISOString(),
    }).eq('id', stateData.sessionId)

    return showErrorPage(res, error)
  }

  // Deep Linkの場合はリダイレクト
  const redirectUri = stateData?.redirectUri || 'interview-bot://auth/callback'
  const url = new URL(redirectUri)
  url.searchParams.set('error', error)
  return res.redirect(302, url.toString())
}

/**
 * 認証成功ページを表示
 */
function showSuccessPage(res: VercelResponse, userName: string) {
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証成功 - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { color: #333; margin-bottom: 0.5rem; font-size: 1.5rem; }
    p { color: #666; margin-bottom: 1.5rem; }
    .name { font-weight: bold; color: #667eea; }
    .hint {
      font-size: 0.9rem;
      color: #888;
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>認証成功！</h1>
    <p>ようこそ、<span class="name">${escapeHtml(userName)}</span> さん</p>
    <div class="hint">
      このウィンドウを閉じて、<br>アプリに戻ってください。
    </div>
  </div>
</body>
</html>
  `
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(html)
}

/**
 * エラーページを表示
 */
function showErrorPage(res: VercelResponse, error: string) {
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>認証エラー - Interview Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 400px;
    }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { color: #333; margin-bottom: 0.5rem; font-size: 1.5rem; }
    p { color: #666; margin-bottom: 1.5rem; }
    .error { color: #e74c3c; font-family: monospace; font-size: 0.9rem; }
    .hint {
      font-size: 0.9rem;
      color: #888;
      background: #f5f5f5;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>認証エラー</h1>
    <p class="error">${escapeHtml(error)}</p>
    <div class="hint">
      このウィンドウを閉じて、<br>もう一度お試しください。
    </div>
  </div>
</body>
</html>
  `
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(html)
}

/**
 * HTMLエスケープ
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
