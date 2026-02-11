/**
 * AI 回答生成プロキシエンドポイント (Phase 8)
 * POST /api/ai/generate
 *
 * JWT 認証必須。OpenAI GPT-5 Mini を使ったストリーミング回答生成。
 * SSE (Server-Sent Events) でチャンク単位でレスポンス。
 * 使用量追跡 + 上限チェック済み。RAGコンテキスト自動取得。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { checkAndReserveUsage, adjustReservedUsage, recordUsage, hasCustomApiKey } from '../../lib/usage'
import { supabaseAdmin } from '../../lib/supabase'
import { generateEmbedding } from '../../lib/openai'
import { getEnv } from '../../lib/env'
import { SYSTEM_PROMPT } from '../../lib/prompts'

export const config = {
  maxDuration: 60,
}

const DEFAULT_MODEL = 'gpt-5-mini'
const DEFAULT_MAX_TOKENS = 500
const MAX_QUESTION_LENGTH = 2000
// 許可モデル一覧（コスト管理のため制限）
const ALLOWED_MODELS = ['gpt-5-mini', 'gpt-4o-mini']
// GPT-5 Mini は temperature パラメータ未サポート（デフォルト1のみ）
const MODELS_WITHOUT_TEMPERATURE = ['gpt-5-mini']
const DEFAULT_TOP_K = 3
const DEFAULT_MIN_SIMILARITY = 0.7

interface MatchResult {
  id: string
  document_id: string
  content: string
  similarity: number
}

interface ValidatedRequest {
  question: string
  context: string | undefined
  includeDocumentContext: boolean
  model: string
  maxTokens: number
  temperature: number | undefined
}

function validateRequest(body: unknown): ValidatedRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  if (!data.question || typeof data.question !== 'string') {
    return { error: 'question is required and must be a string' }
  }

  const question = data.question.trim()
  if (question.length === 0) {
    return { error: 'question cannot be empty' }
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { error: `question must be less than ${MAX_QUESTION_LENGTH} characters` }
  }

  const context = typeof data.context === 'string' ? data.context : undefined
  const includeDocumentContext = data.includeDocumentContext !== false
  const requestedModel = typeof data.model === 'string' ? data.model : DEFAULT_MODEL
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL
  const maxTokens =
    typeof data.maxTokens === 'number' && data.maxTokens > 0 && data.maxTokens <= 4000
      ? data.maxTokens
      : DEFAULT_MAX_TOKENS
  // temperature: モデルがサポートしない場合は undefined（OpenAI APIに渡さない）
  const supportsTemperature = !MODELS_WITHOUT_TEMPERATURE.includes(model)
  const temperature = supportsTemperature
    ? typeof data.temperature === 'number' && data.temperature >= 0 && data.temperature <= 2
      ? data.temperature
      : 0.7
    : undefined

  return { question, context, includeDocumentContext, model, maxTokens, temperature }
}

/**
 * ドキュメントから RAG コンテキストを取得
 */
async function fetchDocumentContext(userId: string, question: string): Promise<string> {
  try {
    const queryEmbedding = await generateEmbedding(question)

    const { data: matches } = await supabaseAdmin.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: DEFAULT_MIN_SIMILARITY,
      match_count: DEFAULT_TOP_K,
      p_user_id: userId,
      p_document_types: null,
    })

    if (!matches || matches.length === 0) return ''

    // ドキュメントメタデータを取得
    const documentIds = [...new Set((matches as MatchResult[]).map((m) => m.document_id))]
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('id, name, type')
      .in('id', documentIds)
      .eq('user_id', userId)

    if (!documents) return ''

    const docMap = new Map(documents.map((d) => [d.id, d]))

    // ドキュメントごとにグループ化
    const grouped = new Map<string, { label: string; chunks: string[] }>()

    for (const match of matches as MatchResult[]) {
      const doc = docMap.get(match.document_id)
      if (!doc) continue

      if (!grouped.has(match.document_id)) {
        const labelMap: Record<string, string> = {
          resume: '履歴書',
          job_posting: '求人票',
          expected_qa: '想定質問',
        }
        const label = labelMap[doc.type] || doc.type
        grouped.set(match.document_id, { label: `${label}: ${doc.name}`, chunks: [] })
      }
      grouped.get(match.document_id)!.chunks.push(match.content)
    }

    return Array.from(grouped.values())
      .map((g) => `【${g.label}】\n${g.chunks.join('\n')}`)
      .join('\n\n')
  } catch (error) {
    console.error('Failed to fetch document context:', error)
    return ''
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ error: 'Origin not allowed' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const jwtPayload = getUserFromRequest(req)
    if (!jwtPayload) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const userId = jwtPayload.sub

    // バリデーション
    const validation = validateRequest(req.body)
    if ('error' in validation) {
      return res.status(400).json({ error: validation.error })
    }

    const { question, context, includeDocumentContext, model, maxTokens, temperature } =
      validation

    // カスタムキーチェック
    const userHasCustomKey = await hasCustomApiKey(userId, 'openai')

    // カスタムキーがなければアトミックに使用量チェック＋予約
    // maxTokens 分を事前予約し、ストリーミング完了後に実際の使用量に調整
    if (!userHasCustomKey) {
      const usage = await checkAndReserveUsage(userId, 'ai_tokens', maxTokens)
      if (!usage.allowed) {
        return res.status(429).json({
          error: 'AI token monthly limit exceeded',
          usage: {
            used: usage.used,
            limit: usage.limit,
            remaining: 0,
          },
        })
      }
    }

    // コンテキスト組み立て
    let fullContext = ''
    if (includeDocumentContext) {
      fullContext = await fetchDocumentContext(userId, question)
    }
    if (context) {
      fullContext = fullContext ? `${fullContext}\n\n${context}` : context
    }

    const userMessage = fullContext
      ? `コンテキスト情報:\n${fullContext}\n\n面接官の質問: ${question}`
      : `面接官の質問: ${question}`

    // OpenAI ストリーミング
    const openai = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') })
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: maxTokens,
      ...(temperature !== undefined && { temperature }),
      stream: true,
      stream_options: { include_usage: true },
    })

    // SSE ヘッダー
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    let totalTokensUsed = 0

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`)
      }

      // ストリーム完了時に usage 情報が含まれる
      if (chunk.usage) {
        totalTokensUsed = chunk.usage.total_tokens
      }
    }

    // トークン使用量を調整＋ログ記録（カスタムキーでなければ）
    if (!userHasCustomKey) {
      // 予約量と実際の使用量の差分を調整
      await adjustReservedUsage(userId, 'ai_tokens', maxTokens, totalTokensUsed)
      // usage_logs にログを記録（カウンターは予約済みなので skipIncrement=true）
      if (totalTokensUsed > 0) {
        await recordUsage(userId, 'ai_completion', totalTokensUsed, 'tokens', {
          model,
          questionLength: question.length,
        }, true)
      }
    }

    // 完了シグナル
    res.write(
      `data: ${JSON.stringify({ type: 'done', tokensUsed: totalTokensUsed })}\n\n`
    )
    res.end()
  } catch (error) {
    console.error('AI generate error:', error)

    // OpenAI APIエラーの種類に応じたメッセージ
    let errorMessage = 'Failed to generate AI response'
    let statusCode = 500

    if (error instanceof Error) {
      if ('status' in error && (error as { status: number }).status === 429) {
        errorMessage = 'AI service rate limit exceeded. Please try again later.'
        statusCode = 429
      } else if ('status' in error && (error as { status: number }).status === 401) {
        errorMessage = 'AI service authentication error'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'AI response timed out. Please try again.'
        statusCode = 504
      }
    }

    // SSE がまだ開始されていない場合は JSON エラー
    if (!res.headersSent) {
      return res.status(statusCode).json({ error: errorMessage })
    }

    // SSE が開始済みの場合はエラーイベントを送信
    try {
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
      res.end()
    } catch {
      // クライアント切断時は何もできない
    }
  }
}
