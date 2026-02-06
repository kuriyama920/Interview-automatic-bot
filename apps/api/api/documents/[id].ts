/**
 * ドキュメント削除エンドポイント
 * DELETE /api/documents/[id]
 *
 * @requires JWT認証
 * @param id - ドキュメントID (UUID形式)
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'

// UUID v4形式の正規表現
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  // CORS プリフライトリクエスト
  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  // CORSヘッダーを設定
  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' })
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // JWT認証
  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub
  const documentId = req.query.id

  // 入力バリデーション
  if (!documentId || typeof documentId !== 'string') {
    return res.status(400).json({ success: false, error: 'Document ID is required' })
  }

  if (!isValidUUID(documentId)) {
    return res.status(400).json({ success: false, error: 'Invalid document ID format' })
  }

  try {
    // ドキュメントの存在と所有権を確認
    const { data: document, error: fetchError } = await supabaseAdmin
      .from('documents')
      .select('id, user_id')
      .eq('id', documentId)
      .is('deleted_at', null)
      .single()

    if (fetchError || !document) {
      return res.status(404).json({ success: false, error: 'Document not found' })
    }

    if (document.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    // チャンクを削除（CASCADEで自動削除されるが、明示的に削除）
    await supabaseAdmin.from('document_chunks').delete().eq('document_id', documentId)

    // ドキュメントを削除（ハード削除）
    const { error: deleteError } = await supabaseAdmin
      .from('documents')
      .delete()
      .eq('id', documentId)

    if (deleteError) {
      return res.status(500).json({ success: false, error: 'Failed to delete document' })
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
