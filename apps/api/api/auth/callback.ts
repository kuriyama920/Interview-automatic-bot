/**
 * Google OAuth コールバックエンドポイント
 * GET /api/auth/callback
 *
 * Googleからリダイレクトされ、JWTを発行してElectronアプリに返す
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

    // エラーチェック
    if (error) {
      return redirectWithError(res, 'interview-bot://auth/callback', `OAuth error: ${error}`)
    }

    if (!code || !state) {
      return redirectWithError(res, 'interview-bot://auth/callback', 'Missing code or state')
    }

    // Vercel KVからstateを取得・検証
    const stateData = await getOAuthState(state as string)
    if (!stateData) {
      return redirectWithError(res, 'interview-bot://auth/callback', 'Invalid or expired state')
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

    // Electronアプリにリダイレクト
    const redirectUrl = new URL(stateData.redirectUri)
    redirectUrl.searchParams.set('token', jwt)
    redirectUrl.searchParams.set('user', JSON.stringify({
      id: user.id,
      email: user.email,
      name: user.display_name,
      picture: user.avatar_url,
      subscriptionTier: user.subscription_tier,
    }))

    res.redirect(302, redirectUrl.toString())
  } catch (error) {
    console.error('Callback error:', error)
    redirectWithError(res, 'interview-bot://auth/callback', 'Authentication failed')
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

function redirectWithError(res: VercelResponse, baseUrl: string, error: string) {
  const url = new URL(baseUrl)
  url.searchParams.set('error', error)
  return res.redirect(302, url.toString())
}
