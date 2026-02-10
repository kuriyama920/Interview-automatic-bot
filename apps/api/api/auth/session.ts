/**
 * 認証セッションエンドポイント
 *
 * POST /api/auth/session - 新しいセッションを作成
 * GET /api/auth/session?id=xxx - セッションのステータスをポーリング
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { isAllowedOrigin } from '../../lib/allowed-origins'
import { getBaseUrl } from '../../lib/url'
import crypto from 'crypto'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  setCorsHeaders(res, origin)

  if (req.method === 'POST') {
    return handleCreateSession(req, res)
  }

  if (req.method === 'GET') {
    return handlePollSession(req, res)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

/**
 * 新しい認証セッションを作成
 */
async function handleCreateSession(req: VercelRequest, res: VercelResponse) {
  try {
    const sessionId = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5分後

    // Webチェックアウトフロー: returnUrl を検証して保存
    const { returnUrl } = req.body || {}
    let validatedReturnUrl: string | null = null

    if (returnUrl && typeof returnUrl === 'string') {
      if (!isAllowedOrigin(returnUrl)) {
        return res.status(400).json({ error: 'Invalid returnUrl origin' })
      }
      // クレデンシャルやフラグメントを除去した安全なURLを保存
      try {
        const parsed = new URL(returnUrl)
        validatedReturnUrl = `${parsed.origin}${parsed.pathname}${parsed.search}`
      } catch {
        return res.status(400).json({ error: 'Invalid returnUrl format' })
      }
    }

    const { error } = await supabaseAdmin.from('auth_sessions').insert({
      id: sessionId,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
      return_url: validatedReturnUrl,
    })

    if (error) {
      console.error('Failed to create auth session:', error)
      return res.status(500).json({ error: 'Failed to create session' })
    }

    // 期限切れセッションをクリーンアップ（非同期）
    void supabaseAdmin.rpc('cleanup_expired_auth_sessions')

    // OAuth URLを生成
    const baseUrl = getBaseUrl(req)
    const authUrl = `${baseUrl}/api/auth/google?session_id=${sessionId}`

    res.status(200).json({
      sessionId,
      authUrl,
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('Create session error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

/**
 * セッションのステータスをポーリング
 * アトミックな DELETE ... RETURNING で同時ポーリング時の二重取得を防止
 */
async function handlePollSession(req: VercelRequest, res: VercelResponse) {
  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Session ID required' })
    }

    // まずアトミックにセッションを消費（completed かつ未期限切れの場合のみ）
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

    // セッションが消費されなかった場合、ステータスを確認
    const { data: session, error } = await supabaseAdmin
      .from('auth_sessions')
      .select('status, expires_at, error')
      .eq('id', id)
      .single()

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // 期限切れチェック
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({
        status: 'expired',
        error: 'Session expired',
      })
    }

    if (session.status === 'pending') {
      return res.status(200).json({ status: 'pending' })
    }

    // エラーの場合
    return res.status(200).json({
      status: 'error',
      error: session.error || 'Authentication failed',
    })
  } catch (error) {
    console.error('Poll session error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
