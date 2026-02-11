/**
 * ベクトル類似検索エンドポイント
 * POST /api/documents/search
 *
 * クエリに類似したドキュメントチャンクを検索（RAG用）
 *
 * @requires JWT認証
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { generateEmbedding } from '../../lib/openai'

// デフォルト値
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

interface ValidatedSearchRequest {
  query: string
  topK: number
  minSimilarity: number
  documentTypes: DocumentType[] | null
}

/**
 * リクエストボディをバリデーション
 */
function validateRequest(body: unknown): ValidatedSearchRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  // query のバリデーション
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

  // topK のバリデーション
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

  // minSimilarity のバリデーション
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

  // documentTypes のバリデーション
  let documentTypes: DocumentType[] | null = null
  if (data.documentTypes !== undefined && data.documentTypes !== null) {
    if (!Array.isArray(data.documentTypes)) {
      return { error: 'documentTypes must be an array' }
    }

    const validTypes = data.documentTypes.filter(
      (t): t is DocumentType => typeof t === 'string' && VALID_DOCUMENT_TYPES.includes(t as DocumentType)
    )

    if (validTypes.length !== data.documentTypes.length) {
      return { error: `documentTypes must only contain: ${VALID_DOCUMENT_TYPES.join(', ')}` }
    }

    documentTypes = validTypes.length > 0 ? validTypes : null
  }

  return {
    query,
    topK,
    minSimilarity,
    documentTypes,
  }
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // JWT認証
  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  // リクエストバリデーション
  const validation = validateRequest(req.body)
  if ('error' in validation) {
    return res.status(400).json({ success: false, error: validation.error })
  }

  const { query, topK, minSimilarity, documentTypes } = validation

  try {
    // クエリのEmbeddingを生成
    const queryEmbedding = await generateEmbedding(query)

    // match_documents関数を呼び出し
    const { data: matches, error: matchError } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: minSimilarity,
      match_count: topK,
      p_user_id: userId,
      p_document_types: documentTypes,
    })

    if (matchError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to search documents',
      })
    }

    if (!matches || matches.length === 0) {
      return res.status(200).json({
        success: true,
        results: [],
      })
    }

    // ドキュメントメタデータを取得
    const documentIds = [...new Set((matches as MatchResult[]).map((m) => m.document_id))]

    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, name, type')
      .in('id', documentIds)
      .eq('user_id', userId)

    if (docError) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch document metadata',
      })
    }

    // ドキュメントIDでマップを作成
    const docMap = new Map(documents?.map((d) => [d.id, d]) ?? [])

    // 結果をドキュメントごとにグループ化
    const groupedResults: Map<
      string,
      {
        documentId: string
        documentName: string
        documentType: string
        chunks: { content: string; similarity: number }[]
      }
    > = new Map()

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

    return res.status(200).json({
      success: true,
      results: Array.from(groupedResults.values()),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return res.status(500).json({ success: false, error: message })
  }
}
