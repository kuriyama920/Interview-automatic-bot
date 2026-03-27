/**
 * ドキュメントルート
 * POST   /api/documents        - アップロード + Embedding生成
 * GET    /api/documents        - 一覧取得
 * DELETE /api/documents/:id    - 削除
 * POST   /api/documents/search - ベクトル類似検索
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import { parseDocument, chunkText, estimateTokens } from '../lib/document-parser'
import { generateEmbedding, generateEmbeddings } from '../lib/openai'
import { isValidUUID } from '../lib/validation'
import { checkUsageLimit, recalculateStorageUsage } from '../lib/usage'
import { invalidateEmbeddingCacheBatch } from '../lib/embedding-cache'
import { Buffer } from 'node:buffer'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', authRequired)

// --- Search constants ---

const DEFAULT_TOP_K = 3
const DEFAULT_MIN_SIMILARITY = 0.7
const MAX_QUERY_LENGTH = 1000
const MAX_TOP_K = 10
const VALID_DOCUMENT_TYPES = ['resume', 'job_posting', 'expected_qa'] as const
type DocumentType = (typeof VALID_DOCUMENT_TYPES)[number]

const UPLOADABLE_DOCUMENT_TYPES = ['resume', 'job_posting'] as const

interface MatchResult {
  id: string
  document_id: string
  content: string
  similarity: number
}

interface MatchResultWithInfo extends MatchResult {
  document_name: string
  document_type: string
}

/** 旧ドキュメント+チャンクを削除し、Embeddingキャッシュを無効化する共通ヘルパー (#5,#10) */
async function deleteDocumentWithChunks(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  documentId: string,
  userId: string,
  executionCtx?: { waitUntil: (p: Promise<unknown>) => void },
): Promise<{ error?: string }> {
  // キャッシュ無効化用にチャンクコンテンツを取得（ベストエフォート）
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('content')
    .eq('document_id', documentId)
    .eq('user_id', userId)

  // #2: DELETE結果のエラーチェック
  const { error: chunkDeleteError } = await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  if (chunkDeleteError) {
    return { error: 'Failed to delete document chunks' }
  }

  const { error: docDeleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId)

  if (docDeleteError) {
    return { error: 'Failed to delete document' }
  }

  // #7: executionCtx の有無を明示的にチェック（空catchを排除）
  if (chunks && chunks.length > 0 && executionCtx) {
    executionCtx.waitUntil(invalidateEmbeddingCacheBatch(chunks.map((ch) => ch.content)))
  }

  return {}
}

/** executionCtx を安全に取得（テスト環境では undefined） */
function getSafeExecutionCtx(c: { executionCtx: ExecutionContext }): { waitUntil: (p: Promise<unknown>) => void } | undefined {
  try { return c.executionCtx } catch { return undefined }
}

// --- POST /api/documents (upload) ---

app.post('/', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const body = await c.req.parseBody()
  const file = body['file'] as File | undefined
  const documentType = body['type'] as string | undefined

  if (!documentType || !UPLOADABLE_DOCUMENT_TYPES.includes(documentType as typeof UPLOADABLE_DOCUMENT_TYPES[number])) {
    return c.json(
      { success: false, error: 'Invalid document type. Must be "resume" or "job_posting"' },
      400
    )
  }

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'No file uploaded' }, 400)
  }

  const filename = file.name || 'unknown'

  try {
    // #3: .maybeSingle() で0件時のエラーを区別
    const { data: existing, error: lookupError } = await supabase
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .eq('name', filename)
      .eq('type', documentType)
      .is('deleted_at', null)
      .maybeSingle()

    if (lookupError) {
      return c.json({ success: false, error: 'Failed to check existing document' }, 500)
    }

    // #4: 上限チェック — 上書き時はドキュメント数が増えないのでスキップ
    if (!existing) {
      const usage = await checkUsageLimit(supabase, userId, 'documents')
      if (!usage.allowed) {
        return c.json(
          {
            success: false,
            error:
              'ドキュメントの登録上限に達しました。不要なドキュメントを削除するか、プランをアップグレードしてください。',
            usage: { used: usage.used, limit: usage.limit, remaining: 0 },
          },
          429
        )
      }
    }

    // #1: 先にパース・Embedding生成を完了（旧ドキュメント削除前にデータ準備）
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseDocument(buffer, filename)
    const chunks = chunkText(parsed.text)

    if (chunks.length === 0) {
      return c.json({ success: false, error: 'Document contains no extractable text' }, 400)
    }

    const chunkTexts = chunks.map((ch) => ch.content)
    const embeddings = await generateEmbeddings(chunkTexts, c.env.OPENAI_API_KEY, c.env)

    // データ準備完了後に旧ドキュメントを削除（データ消失リスクを最小化）
    if (existing) {
      const safeCtx = getSafeExecutionCtx(c)
      const deleteResult = await deleteDocumentWithChunks(supabase, existing.id, userId, safeCtx)
      if (deleteResult.error) {
        return c.json({ success: false, error: 'Failed to replace existing document' }, 500)
      }
    }

    const result = await insertDocumentAndChunks(supabase, userId, filename, documentType, file, parsed, chunks, embeddings)
    if (!result.success) {
      return c.json({ success: false, error: result.error }, result.status as 500)
    }

    // ストレージ使用量を再計算（失敗してもアップロード自体は成功扱い）
    try {
      await recalculateStorageUsage(supabase, userId)
    } catch {
      // ストレージ計算の失敗はアップロード成功に影響させない
    }

    return c.json({ success: true, document: result.document })
  } catch (error) {
    // #6: クライアントエラーとサーバーエラーを区別
    if (error instanceof Error && error.message.includes('no extractable text')) {
      return c.json({ success: false, error: error.message }, 400)
    }
    return c.json({ success: false, error: 'Failed to process document' }, 500)
  }
})

/** ドキュメントとチャンクをDBに挿入する (#5: ハンドラーから抽出) */
async function insertDocumentAndChunks(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
  filename: string,
  documentType: string,
  file: File,
  parsed: { pageCount?: number; wordCount: number; text: string },
  chunks: { content: string; chunkIndex: number }[],
  embeddings: number[][],
): Promise<{ success: true; document: Record<string, unknown> } | { success: false; error: string; status: number }> {
  const { data: document, error: docError } = await supabase
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
    return { success: false, error: 'Failed to save document', status: 500 }
  }

  const chunkInserts = chunks.map((chunk, index) => ({
    document_id: document.id,
    user_id: userId,
    content: chunk.content,
    chunk_index: chunk.chunkIndex,
    embedding: `[${embeddings[index].join(',')}]`,
  }))

  const { error: chunksError } = await supabase.from('document_chunks').insert(chunkInserts)

  if (chunksError) {
    await supabase.from('documents').delete().eq('id', document.id)
    return { success: false, error: 'Failed to save document chunks', status: 500 }
  }

  const { error: updateError } = await supabase
    .from('documents')
    .update({ status: 'ready', processed_at: new Date().toISOString() })
    .eq('id', document.id)

  if (updateError) {
    await supabase
      .from('documents')
      .update({ status: 'error', error_message: 'Failed to update status after processing' })
      .eq('id', document.id)
  }

  return {
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
  }
}

// --- GET /api/documents ---

app.get('/', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const { data: documents, error } = await supabase
    .from('documents')
    .select('id, name, type, status, chunk_count, word_count, uploaded_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false })

  if (error) {
    return c.json({ success: false, error: 'Failed to fetch documents' }, 500)
  }

  return c.json({
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
})

// --- DELETE /api/documents/:id ---

app.delete('/:id', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const documentId = c.req.param('id')

  if (!isValidUUID(documentId)) {
    return c.json({ success: false, error: 'Invalid document ID format' }, 400)
  }

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('id, user_id')
    .eq('id', documentId)
    .is('deleted_at', null)
    .single()

  if (fetchError || !document) {
    return c.json({ success: false, error: 'Document not found' }, 404)
  }

  if (document.user_id !== userId) {
    return c.json({ success: false, error: 'Access denied' }, 403)
  }

  const safeCtx = getSafeExecutionCtx(c)
  const deleteResult = await deleteDocumentWithChunks(supabase, documentId, userId, safeCtx)
  if (deleteResult.error) {
    return c.json({ success: false, error: deleteResult.error }, 500)
  }

  // ストレージ使用量を再計算（失敗しても削除自体は成功扱い）
  try {
    await recalculateStorageUsage(supabase, userId)
  } catch {
    // ストレージ計算の失敗は削除成功に影響させない
  }

  return c.json({ success: true })
})

// --- POST /api/documents/search ---

interface ValidatedSearchRequest {
  query: string
  topK: number
  minSimilarity: number
  documentTypes: DocumentType[] | null
}

function validateSearchRequest(body: unknown): ValidatedSearchRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  if (!data.query || typeof data.query !== 'string') {
    return { error: 'Query is required and must be a string' }
  }

  const query = data.query.trim()
  if (query.length === 0) {
    return { error: 'Query cannot be empty' }
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return { error: `Query must be less than ${MAX_QUERY_LENGTH} characters` }
  }

  let topK = DEFAULT_TOP_K
  if (data.topK !== undefined) {
    if (typeof data.topK !== 'number' || !Number.isInteger(data.topK)) {
      return { error: 'topK must be an integer' }
    }
    if (data.topK < 1 || data.topK > MAX_TOP_K) {
      return { error: `topK must be between 1 and ${MAX_TOP_K}` }
    }
    topK = data.topK
  }

  let minSimilarity = DEFAULT_MIN_SIMILARITY
  if (data.minSimilarity !== undefined) {
    if (typeof data.minSimilarity !== 'number') {
      return { error: 'minSimilarity must be a number' }
    }
    if (data.minSimilarity < 0 || data.minSimilarity > 1) {
      return { error: 'minSimilarity must be between 0 and 1' }
    }
    minSimilarity = data.minSimilarity
  }

  let documentTypes: DocumentType[] | null = null
  if (data.documentTypes !== undefined && data.documentTypes !== null) {
    if (!Array.isArray(data.documentTypes)) {
      return { error: 'documentTypes must be an array' }
    }

    const validTypes = data.documentTypes.filter(
      (t): t is DocumentType =>
        typeof t === 'string' && VALID_DOCUMENT_TYPES.includes(t as DocumentType)
    )

    if (validTypes.length !== data.documentTypes.length) {
      return { error: `documentTypes must only contain: ${VALID_DOCUMENT_TYPES.join(', ')}` }
    }

    documentTypes = validTypes.length > 0 ? validTypes : null
  }

  return { query, topK, minSimilarity, documentTypes }
}

app.post('/search', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json()

  const validation = validateSearchRequest(body)
  if ('error' in validation) {
    return c.json({ success: false, error: validation.error }, 400)
  }

  const { query, topK, minSimilarity, documentTypes } = validation

  const searchUsage = await checkUsageLimit(supabase, userId, 'ai_tokens')
  if (!searchUsage.allowed) {
    return c.json(
      {
        success: false,
        error: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: searchUsage.used, limit: searchUsage.limit, remaining: 0 },
      },
      429
    )
  }

  const queryEmbedding = await generateEmbedding(query, c.env.OPENAI_API_KEY, c.env)

  const { data: rawMatches, error: matchError } = await supabase.rpc('match_documents_with_info', {
    query_embedding: queryEmbedding,
    match_threshold: minSimilarity,
    match_count: topK,
    p_user_id: userId,
  })

  if (matchError) {
    return c.json({ success: false, error: 'Failed to search documents' }, 500)
  }

  if (!rawMatches || rawMatches.length === 0) {
    return c.json({ success: true, results: [] })
  }

  // ドキュメントタイプでフィルタリング（RPC関数はタイプフィルタ未対応）
  const matches = documentTypes
    ? (rawMatches as MatchResultWithInfo[]).filter((m) => documentTypes.includes(m.document_type))
    : (rawMatches as MatchResultWithInfo[])

  if (matches.length === 0) {
    return c.json({ success: true, results: [] })
  }

  const groupedResults = new Map<
    string,
    {
      documentId: string
      documentName: string
      documentType: string
      chunks: { content: string; similarity: number }[]
    }
  >()

  for (const match of matches) {
    if (!groupedResults.has(match.document_id)) {
      groupedResults.set(match.document_id, {
        documentId: match.document_id,
        documentName: match.document_name,
        documentType: match.document_type,
        chunks: [],
      })
    }

    groupedResults.get(match.document_id)!.chunks.push({
      content: match.content,
      similarity: match.similarity,
    })
  }

  return c.json({
    success: true,
    results: Array.from(groupedResults.values()),
  })
})

export default app
