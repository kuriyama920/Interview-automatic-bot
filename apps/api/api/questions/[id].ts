/**
 * 想定質問削除エンドポイント
 * DELETE /api/questions/[id]
 *
 * @requires JWT認証
 * @param id - 質問ID (UUID形式)
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' })
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub
  const questionId = req.query.id

  if (!questionId || typeof questionId !== 'string') {
    return res.status(400).json({ success: false, error: 'Question ID is required' })
  }

  if (!isValidUUID(questionId)) {
    return res.status(400).json({ success: false, error: 'Invalid question ID format' })
  }

  try {
    // 質問の存在と所有権を確認
    const { data: question, error: fetchError } = await supabaseAdmin
      .from('interview_questions')
      .select('id, user_id, chunk_id')
      .eq('id', questionId)
      .single()

    if (fetchError || !question) {
      return res.status(404).json({ success: false, error: 'Question not found' })
    }

    if (question.user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Access denied' })
    }

    // 関連するchunkを削除
    if (question.chunk_id) {
      await supabaseAdmin
        .from('document_chunks')
        .delete()
        .eq('id', question.chunk_id)
        .eq('user_id', userId)
    }

    // 質問を削除
    const { error: deleteError } = await supabaseAdmin
      .from('interview_questions')
      .delete()
      .eq('id', questionId)
      .eq('user_id', userId)

    if (deleteError) {
      return res.status(500).json({ success: false, error: 'Failed to delete question' })
    }

    // 仮想ドキュメントのchunk_countを更新
    const { data: virtualDoc } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .eq('type', 'expected_qa')
      .is('deleted_at', null)
      .single()

    if (virtualDoc) {
      const { count } = await supabaseAdmin
        .from('document_chunks')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', virtualDoc.id)
        .eq('user_id', userId)

      await supabaseAdmin
        .from('documents')
        .update({ chunk_count: count ?? 0 })
        .eq('id', virtualDoc.id)
    }

    return res.status(200).json({ success: true })
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to delete question' })
  }
}
