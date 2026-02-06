/**
 * 認証セッションエンドポイント
 *
 * POST /api/auth/session - 新しいセッションを作成
 * GET /api/auth/session?id=xxx - セッションのステータスをポーリング
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { supabaseAdmin } from '../../lib/supabase'
import crypto from 'crypto'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

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

    const { error } = await supabaseAdmin.from('auth_sessions').insert({
      id: sessionId,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
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
 */
async function handlePollSession(req: VercelRequest, res: VercelResponse) {
  try {
    const { id } = req.query

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Session ID required' })
    }

    const { data: session, error } = await supabaseAdmin
      .from('auth_sessions')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    // 期限切れチェック
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({
        status: 'expired',
        error: 'Session expired'
      })
    }

    // ステータスに応じてレスポンス
    if (session.status === 'pending') {
      return res.status(200).json({ status: 'pending' })
    }

    if (session.status === 'completed') {
      // セッションを削除（一度だけ使用可能）
      await supabaseAdmin.from('auth_sessions').delete().eq('id', id)

      return res.status(200).json({
        status: 'completed',
        token: session.token,
        user: session.user_data,
      })
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

function getBaseUrl(req: VercelRequest): string {
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${protocol}://${host}`
}
