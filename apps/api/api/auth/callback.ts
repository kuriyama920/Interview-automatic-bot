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
    ai_model: 'gpt-5-mini',
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
 * Linear Design + Apple Vibrancy スタイル
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
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }

    /* 背景装飾 */
    .bg-decoration {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.6;
      pointer-events: none;
    }
    .bg-1 {
      width: 400px;
      height: 400px;
      background: rgba(59, 130, 246, 0.15);
      top: -100px;
      right: -100px;
    }
    .bg-2 {
      width: 300px;
      height: 300px;
      background: rgba(16, 185, 129, 0.12);
      bottom: -50px;
      left: -50px;
    }

    .container {
      position: relative;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 1.5rem;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
      text-align: center;
      max-width: 420px;
      width: 90%;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .icon-wrapper {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(16, 185, 129, 0.05));
      border-radius: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .icon {
      width: 40px;
      height: 40px;
      color: #10b981;
    }

    h1 {
      color: #111827;
      margin-bottom: 0.5rem;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    .welcome {
      color: #6b7280;
      font-size: 0.95rem;
      margin-bottom: 2rem;
    }

    .name {
      font-weight: 600;
      color: #3b82f6;
    }

    .hint {
      font-size: 0.875rem;
      color: #6b7280;
      background: #f3f4f6;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      line-height: 1.6;
    }

    .hint-icon {
      display: inline-block;
      margin-right: 0.5rem;
      opacity: 0.7;
    }

    .countdown {
      margin-top: 1.5rem;
      font-size: 0.75rem;
      color: #9ca3af;
    }

    .brand {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: #9ca3af;
      font-size: 0.8rem;
    }

    .brand-icon {
      width: 20px;
      height: 20px;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-icon svg {
      width: 12px;
      height: 12px;
      color: #3b82f6;
    }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>

  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    </div>

    <h1>認証が完了しました</h1>
    <p class="welcome">ようこそ、<span class="name">${escapeHtml(userName)}</span> さん</p>

    <div class="hint">
      <span class="hint-icon">💡</span>
      このウィンドウを閉じて、アプリに戻ってください
    </div>

    <p class="countdown">このページは自動的に閉じられます...</p>

    <div class="brand">
      <div class="brand-icon">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      Interview Bot
    </div>
  </div>

  <script>
    // 5秒後にウィンドウを閉じる試行
    setTimeout(() => {
      window.close();
    }, 5000);
  </script>
</body>
</html>
  `
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(200).send(html)
}

/**
 * エラーページを表示
 * Linear Design + Apple Vibrancy スタイル
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
      font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }

    /* 背景装飾 */
    .bg-decoration {
      position: absolute;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.5;
      pointer-events: none;
    }
    .bg-1 {
      width: 400px;
      height: 400px;
      background: rgba(239, 68, 68, 0.12);
      top: -100px;
      right: -100px;
    }
    .bg-2 {
      width: 300px;
      height: 300px;
      background: rgba(249, 115, 22, 0.1);
      bottom: -50px;
      left: -50px;
    }

    .container {
      position: relative;
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      padding: 3rem;
      border-radius: 1.5rem;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
      text-align: center;
      max-width: 420px;
      width: 90%;
      animation: fadeIn 0.4s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .icon-wrapper {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.05));
      border-radius: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .icon {
      width: 40px;
      height: 40px;
      color: #ef4444;
    }

    h1 {
      color: #111827;
      margin-bottom: 0.75rem;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.025em;
    }

    .error-message {
      color: #991b1b;
      font-size: 0.875rem;
      background: #fee2e2;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      word-break: break-all;
    }

    .hint {
      font-size: 0.875rem;
      color: #6b7280;
      background: #f3f4f6;
      padding: 1rem 1.25rem;
      border-radius: 0.75rem;
      line-height: 1.6;
    }

    .retry-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
    }

    .retry-btn:hover {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .brand {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0, 0, 0, 0.06);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      color: #9ca3af;
      font-size: 0.8rem;
    }

    .brand-icon {
      width: 20px;
      height: 20px;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .brand-icon svg {
      width: 12px;
      height: 12px;
      color: #3b82f6;
    }
  </style>
</head>
<body>
  <div class="bg-decoration bg-1"></div>
  <div class="bg-decoration bg-2"></div>

  <div class="container">
    <div class="icon-wrapper">
      <svg class="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    </div>

    <h1>認証に失敗しました</h1>

    <div class="error-message">${escapeHtml(error)}</div>

    <div class="hint">
      このウィンドウを閉じて、アプリからもう一度ログインをお試しください
    </div>

    <button class="retry-btn" onclick="window.close()">
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
      ウィンドウを閉じる
    </button>

    <div class="brand">
      <div class="brand-icon">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
      </div>
      Interview Bot
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
