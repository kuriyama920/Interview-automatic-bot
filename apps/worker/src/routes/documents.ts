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
import { checkUsageLimit } from '../lib/usage'
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

interface MatchResult {
  id: string
  document_id: string
  content: string
  similarity: number
}

// --- POST /api/documents (upload) ---

app.post('/', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

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

  const body = await c.req.parseBody()
  const file = body['file'] as File | undefined
  const documentType = body['type'] as string | undefined

  if (!documentType || !['resume', 'job_posting'].includes(documentType)) {
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
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseDocument(buffer, filename)
    const chunks = chunkText(parsed.text)

    if (chunks.length === 0) {
      return c.json({ success: false, error: 'Document contains no extractable text' }, 400)
    }

    const chunkTexts = chunks.map((ch) => ch.content)
    const embeddings = await generateEmbeddings(chunkTexts, c.env.OPENAI_API_KEY, c.env)

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
      return c.json({ success: false, error: 'Failed to save document' }, 500)
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
      return c.json({ success: false, error: 'Failed to save document chunks' }, 500)
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

    return c.json({
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
    return c.json({ success: false, error: message }, 400)
  }
})

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

  await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  const { error: deleteError } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('user_id', userId)

  if (deleteError) {
    return c.json({ success: false, error: 'Failed to delete document' }, 500)
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

  const { data: matches, error: matchError } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: minSimilarity,
    match_count: topK,
    p_user_id: userId,
    p_document_types: documentTypes,
  })

  if (matchError) {
    return c.json({ success: false, error: 'Failed to search documents' }, 500)
  }

  if (!matches || matches.length === 0) {
    return c.json({ success: true, results: [] })
  }

  const documentIds = [...new Set((matches as MatchResult[]).map((m) => m.document_id))]

  const { data: documents, error: docError } = await supabase
    .from('documents')
    .select('id, name, type')
    .in('id', documentIds)
    .eq('user_id', userId)

  if (docError) {
    return c.json({ success: false, error: 'Failed to fetch document metadata' }, 500)
  }

  const docMap = new Map(documents?.map((d) => [d.id, d]) ?? [])

  const groupedResults = new Map<
    string,
    {
      documentId: string
      documentName: string
      documentType: string
      chunks: { content: string; similarity: number }[]
    }
  >()

  for (const match of matches as MatchResult[]) {
    const doc = docMap.get(match.document_id)
    if (!doc) continue

    if (!groupedResults.has(match.document_id)) {
      groupedResults.set(match.document_id, {
        documentId: match.document_id,
        documentName: doc.name,
        documentType: doc.type,
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
