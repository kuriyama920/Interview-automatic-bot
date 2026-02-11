/**
 * ドキュメント CRUD 統合エンドポイント
 * POST /api/documents - ドキュメントアップロード + Embedding生成
 * GET /api/documents - ドキュメント一覧取得
 * DELETE /api/documents/:id - ドキュメント削除
 *
 * @requires JWT認証
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import { readFile } from 'fs/promises'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { parseDocument, chunkText, estimateTokens } from '../../lib/document-parser'
import { generateEmbeddings } from '../../lib/openai'
import { isValidUUID } from '../../lib/validation'

// Vercel Serverless: body parserを無効化（multipart対応）
export const config = {
  api: {
    bodyParser: false,
  },
}

interface UploadedFile {
  filepath: string
  originalFilename: string | null
  size: number
}

async function handleUpload(req: VercelRequest, res: VercelResponse, userId: string) {
  const form = formidable({
    maxFileSize: 10 * 1024 * 1024,
    maxFiles: 1,
  })

  let fields: formidable.Fields
  let files: formidable.Files

  try {
    ;[fields, files] = await form.parse(req)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse form data'
    return res.status(400).json({ success: false, error: message })
  }

  const typeField = fields.type
  const documentType = Array.isArray(typeField) ? typeField[0] : typeField

  if (!documentType || !['resume', 'job_posting'].includes(documentType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid document type. Must be "resume" or "job_posting"',
    })
  }

  const fileField = files.file
  const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField

  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No file uploaded' })
  }

  const file = uploadedFile as UploadedFile
  const filename = file.originalFilename || 'unknown'

  try {
    const buffer = await readFile(file.filepath)
    const parsed = await parseDocument(buffer, filename)
    const chunks = chunkText(parsed.text)

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Document contains no extractable text',
      })
    }

    const chunkTexts = chunks.map((c) => c.content)
    const embeddings = await generateEmbeddings(chunkTexts)

    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        user_id: userId,
        name: filename,
        type: documentType,
        status: 'processing',
        storage_path: `inline/${userId}/${Date.now()}_${filename}`,
        file_size_bytes: file.size,
        page_count: parsed.pageCount || null,
        word_count: parsed.wordCount,
        chunk_count: chunks.length,
        total_tokens: estimateTokens(parsed.text),
      })
      .select()
      .single()

    if (docError || !document) {
      return res.status(500).json({ success: false, error: 'Failed to save document' })
    }

    const chunkInserts = chunks.map((chunk, index) => ({
      document_id: document.id,
      user_id: userId,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      embedding: `[${embeddings[index].join(',')}]`,
    }))

    const { error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunkInserts)

    if (chunksError) {
      await supabaseAdmin.from('documents').delete().eq('id', document.id)
      return res.status(500).json({ success: false, error: 'Failed to save document chunks' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        status: 'ready',
        processed_at: new Date().toISOString(),
      })
      .eq('id', document.id)

    if (updateError) {
      await supabaseAdmin
        .from('documents')
        .update({ status: 'error', error_message: 'Failed to update status after processing' })
        .eq('id', document.id)
    }

    return res.status(200).json({
      success: true,
      document: {
        id: document.id,
        name: document.name,
        type: document.type,
        status: 'ready',
        chunkCount: chunks.length,
        wordCount: parsed.wordCount,
        uploadedAt: document.uploaded_at,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to process document'
    return res.status(400).json({ success: false, error: message })
  }
}

async function handleList(_req: VercelRequest, res: VercelResponse, userId: string) {
  const { data: documents, error } = await supabaseAdmin
    .from('documents')
    .select('id, name, type, status, chunk_count, word_count, uploaded_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  if (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch documents' })
  }

  return res.status(200).json({
    success: true,
    documents: documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      status: doc.status,
      chunkCount: doc.chunk_count,
      wordCount: doc.word_count,
      uploadedAt: doc.uploaded_at,
    })),
  })
}

async function handleDelete(req: VercelRequest, res: VercelResponse, userId: string) {
  const documentId = req.query.id

  if (!documentId || typeof documentId !== 'string') {
    return res.status(400).json({ success: false, error: 'Document ID is required' })
  }

  if (!isValidUUID(documentId)) {
    return res.status(400).json({ success: false, error: 'Invalid document ID format' })
  }

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

  await supabaseAdmin
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  const { error: deleteError } = await supabaseAdmin
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId)

  if (deleteError) {
    return res.status(500).json({ success: false, error: 'Failed to delete document' })
  }

  return res.status(200).json({ success: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  try {
    if (req.method === 'POST') {
      return handleUpload(req, res, userId)
    } else if (req.method === 'GET') {
      return handleList(req, res, userId)
    } else if (req.method === 'DELETE') {
      return handleDelete(req, res, userId)
    } else {
      return res.status(405).json({ error: 'Method not allowed' })
    }
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
