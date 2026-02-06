/**
 * ドキュメント管理エンドポイント
 * POST /api/documents - ドキュメントアップロード + Embedding生成
 * GET /api/documents - ドキュメント一覧取得
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import formidable from 'formidable'
import { readFile } from 'fs/promises'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { parseDocument, chunkText, estimateTokens } from '../../lib/document-parser'
import { generateEmbeddings } from '../../lib/openai'

// Vercel Serverless: body parserを無効化
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
  // multipart/form-dataをパース
  const form = formidable({
    maxFileSize: 10 * 1024 * 1024, // 10MB
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

  // ドキュメントタイプを取得
  const typeField = fields.type
  const documentType = Array.isArray(typeField) ? typeField[0] : typeField

  if (!documentType || !['resume', 'job_posting'].includes(documentType)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid document type. Must be "resume" or "job_posting"',
    })
  }

  // ファイルを取得
  const fileField = files.file
  const uploadedFile = Array.isArray(fileField) ? fileField[0] : fileField

  if (!uploadedFile) {
    return res.status(400).json({ success: false, error: 'No file uploaded' })
  }

  const file = uploadedFile as UploadedFile
  const filename = file.originalFilename || 'unknown'

  try {
    // ファイルを読み込み
    const buffer = await readFile(file.filepath)

    // ドキュメントを解析
    const parsed = await parseDocument(buffer, filename)

    // テキストをチャンクに分割
    const chunks = chunkText(parsed.text)

    if (chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Document contains no extractable text',
      })
    }

    // Embeddingを生成
    const chunkTexts = chunks.map((c) => c.content)
    const embeddings = await generateEmbeddings(chunkTexts)

    // ドキュメントをDBに挿入
    // Note: storage_pathはPhase 6では使用しないがDBスキーマで必須のため、
    //       マイグレーション003_storage_path_nullable.sql適用後はnull許可
    const { data: document, error: docError } = await supabaseAdmin
      .from('documents')
      .insert({
        user_id: userId,
        name: filename,
        type: documentType,
        status: 'processing',
        storage_path: `inline/${userId}/${Date.now()}_${filename}`, // Phase 6: inline処理を示すダミーパス
        file_size_bytes: file.size,
        page_count: parsed.pageCount || null,
        word_count: parsed.wordCount,
        chunk_count: chunks.length,
        total_tokens: estimateTokens(parsed.text),
      })
      .select()
      .single()

    if (docError || !document) {
      return res.status(500).json({
        success: false,
        error: 'Failed to save document',
      })
    }

    // チャンクをDBに挿入
    const chunkInserts = chunks.map((chunk, index) => ({
      document_id: document.id,
      user_id: userId,
      content: chunk.content,
      chunk_index: chunk.chunkIndex,
      embedding: `[${embeddings[index].join(',')}]`, // pgvector形式
    }))

    const { error: chunksError } = await supabaseAdmin
      .from('document_chunks')
      .insert(chunkInserts)

    if (chunksError) {
      // ドキュメントを削除してロールバック
      await supabaseAdmin.from('documents').delete().eq('id', document.id)
      return res.status(500).json({
        success: false,
        error: 'Failed to save document chunks',
      })
    }

    // ステータスを更新
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        status: 'ready',
        processed_at: new Date().toISOString(),
      })
      .eq('id', document.id)

    if (updateError) {
      // ステータス更新失敗は警告レベル（処理自体は成功）
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

async function handleList(req: VercelRequest, res: VercelResponse, userId: string) {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  // CORS プリフライトリクエスト
  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  // CORSヘッダーを設定
  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  // JWT認証
  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  if (req.method === 'POST') {
    return handleUpload(req, res, userId)
  } else if (req.method === 'GET') {
    return handleList(req, res, userId)
  } else {
    return res.status(405).json({ error: 'Method not allowed' })
  }
}
