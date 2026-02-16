/**
 * AI 統合エンドポイント (Phase 8)
 * POST /api/ai/generate - SSE ストリーミング回答生成
 * POST /api/ai/embeddings - Embedding ベクトル生成
 *
 * JWT 認証必須。使用量追跡 + 上限チェック済み。
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { getUserFromRequest } from '../../lib/auth'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { checkAndReserveUsage, adjustReservedUsage, recordUsage, hasCustomApiKey } from '../../lib/usage'
import { supabaseAdmin } from '../../lib/supabase'
import { generateEmbedding, generateEmbeddings } from '../../lib/openai'
import { getEnv } from '../../lib/env'
import { SYSTEM_PROMPT } from '../../lib/prompts'
import { getRoute } from '../../lib/routing'
import { formatProfileContext } from '../../lib/profile'

export const config = {
  maxDuration: 60,
}

// --- Generate 用定数 ---
const DEFAULT_MODEL = 'gpt-5-nano'
const DEFAULT_MAX_TOKENS = 2000
const MAX_QUESTION_LENGTH = 2000
const ALLOWED_MODELS = ['gpt-5-nano', 'gpt-5-mini', 'gpt-4o-mini']
const MODELS_WITHOUT_TEMPERATURE = ['gpt-5-nano', 'gpt-5-mini']
const MODELS_WITH_REASONING = ['gpt-5-nano', 'gpt-5-mini']
const DEFAULT_TOP_K = 3
const DEFAULT_MIN_SIMILARITY = 0.7

// --- Embeddings 用定数 ---
const MAX_TEXTS = 20
const MAX_TEXT_LENGTH = 8000

// --- Generate 用ロジック ---

interface MatchResult {
  id: string
  document_id: string
  content: string
  similarity: number
}

interface ValidatedGenerateRequest {
  question: string
  context: string | undefined
  includeDocumentContext: boolean
  model: string
  maxTokens: number
  temperature: number | undefined
}

function validateGenerateRequest(body: unknown): ValidatedGenerateRequest | { error: string } {
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
  const supportsTemperature = !MODELS_WITHOUT_TEMPERATURE.includes(model)
  const temperature = supportsTemperature
    ? typeof data.temperature === 'number' && data.temperature >= 0 && data.temperature <= 2
      ? data.temperature
      : 0.7
    : undefined

  return { question, context, includeDocumentContext, model, maxTokens, temperature }
}

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

    const documentIds = [...new Set((matches as MatchResult[]).map((m) => m.document_id))]
    const { data: documents } = await supabaseAdmin
      .from('documents')
      .select('id, name, type')
      .in('id', documentIds)
      .eq('user_id', userId)

    if (!documents) return ''

    const docMap = new Map(documents.map((d) => [d.id, d]))

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

const RATE_LIMIT_WINDOW_MS = 60_000  // 1分
const RATE_LIMIT_MAX_REQUESTS = 20   // 1分あたり最大20リクエスト

async function checkRateLimit(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
  const { count } = await supabaseAdmin
    .from('usage_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('usage_type', 'ai_completion')
    .gte('created_at', since)

  return (count ?? 0) < RATE_LIMIT_MAX_REQUESTS
}

async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  // レート制限チェック（1分あたり20リクエスト）
  const withinLimit = await checkRateLimit(userId)
  if (!withinLimit) {
    return res.status(429).json({
      error: 'リクエストが多すぎます。しばらく待ってから再度お試しください。',
      retryAfter: 60,
    })
  }

  const validation = validateGenerateRequest(req.body)
  if ('error' in validation) {
    return res.status(400).json({ error: validation.error })
  }

  const { question, context, includeDocumentContext, model, maxTokens, temperature } = validation

  const userHasCustomKey = await hasCustomApiKey(userId, 'openai')

  if (!userHasCustomKey) {
    const usage = await checkAndReserveUsage(userId, 'ai_tokens', maxTokens)
    if (!usage.allowed) {
      return res.status(429).json({
        error: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: usage.used, limit: usage.limit, remaining: 0 },
      })
    }
  }

  // プロフィールとドキュメントコンテキストを並行取得
  const [profileResult, docContext] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('interview_profile')
      .eq('id', userId)
      .single(),
    includeDocumentContext
      ? fetchDocumentContext(userId, question)
      : Promise.resolve(''),
  ])

  const profileContext = formatProfileContext(profileResult.data?.interview_profile)

  let fullContext = docContext
  if (context) {
    fullContext = fullContext ? `${fullContext}\n\n${context}` : context
  }

  const userMessage = [
    profileContext ? `【候補者プロフィール】\n${profileContext}` : '',
    fullContext ? `コンテキスト情報:\n${fullContext}` : '',
    `面接官の質問: ${question}`,
  ].filter(Boolean).join('\n\n')

  try {
    const openai = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') })
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: maxTokens,
      ...(MODELS_WITH_REASONING.includes(model) && { reasoning_effort: 'low' as const }),
      ...(temperature !== undefined && { temperature }),
      stream: true,
      stream_options: { include_usage: true },
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    let totalTokensUsed = 0
    let clientDisconnected = false
    res.on('close', () => { clientDisconnected = true })

    for await (const chunk of stream) {
      if (clientDisconnected) break
      const content = chunk.choices[0]?.delta?.content || ''
      if (content) {
        try {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content })}\n\n`)
        } catch {
          break // クライアント切断
        }
      }
      if (chunk.usage) {
        totalTokensUsed = chunk.usage.total_tokens
      }
    }

    if (!userHasCustomKey) {
      await adjustReservedUsage(userId, 'ai_tokens', maxTokens, totalTokensUsed)
      if (totalTokensUsed > 0) {
        await recordUsage(userId, 'ai_completion', totalTokensUsed, 'tokens', {
          model,
          questionLength: question.length,
        }, true)
      }
    }

    if (!clientDisconnected) {
      res.write(
        `data: ${JSON.stringify({ type: 'done', tokensUsed: totalTokensUsed })}\n\n`
      )
      res.end()
    }
  } catch (error) {
    // ストリーミング失敗時: 予約済みusageを解放
    if (!userHasCustomKey) {
      await adjustReservedUsage(userId, 'ai_tokens', maxTokens, 0).catch(() => {})
    }
    throw error
  }
}

// --- Embeddings 用ロジック ---

async function handleEmbeddings(req: VercelRequest, res: VercelResponse) {
  let reservedUserId: string | null = null
  let reservedTokens = 0

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub
  const { text, texts } = req.body || {}

  if (!text && !texts) {
    return res.status(400).json({ error: 'text or texts is required' })
  }

  let inputTexts: string[]

  if (text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text must be a non-empty string' })
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return res.status(400).json({ error: `text must be less than ${MAX_TEXT_LENGTH} characters` })
    }
    inputTexts = [text]
  } else {
    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'texts must be a non-empty array' })
    }
    if (texts.length > MAX_TEXTS) {
      return res.status(400).json({ error: `texts must have at most ${MAX_TEXTS} items` })
    }
    for (const t of texts) {
      if (typeof t !== 'string' || t.trim().length === 0) {
        return res.status(400).json({ error: 'Each text must be a non-empty string' })
      }
      if (t.length > MAX_TEXT_LENGTH) {
        return res.status(400).json({ error: `Each text must be less than ${MAX_TEXT_LENGTH} characters` })
      }
    }
    inputTexts = texts
  }

  const userHasCustomKey = await hasCustomApiKey(userId, 'openai')

  const totalChars = inputTexts.reduce((sum, t) => sum + t.length, 0)
  const estimatedTokens = Math.ceil(totalChars * 0.5)

  if (!userHasCustomKey) {
    const usage = await checkAndReserveUsage(userId, 'ai_tokens', estimatedTokens)
    if (!usage.allowed) {
      return res.status(429).json({
        error: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: usage.used, limit: usage.limit, remaining: 0 },
      })
    }
    reservedUserId = userId
    reservedTokens = estimatedTokens
  }

  try {
    let embeddings: number[][]

    if (inputTexts.length === 1) {
      const embedding = await generateEmbedding(inputTexts[0])
      embeddings = [embedding]
    } else {
      embeddings = await generateEmbeddings(inputTexts)
    }

    reservedUserId = null

    if (!userHasCustomKey) {
      await recordUsage(userId, 'embedding', estimatedTokens, 'tokens', {
        textCount: inputTexts.length,
        totalChars,
      }, true)
    }

    return res.status(200).json({ success: true, embeddings })
  } catch (error) {
    if (reservedUserId && reservedTokens > 0) {
      await adjustReservedUsage(reservedUserId, 'ai_tokens', reservedTokens, 0)
    }
    console.error('Embedding generation failed:', error)
    throw new Error('Failed to generate embeddings')
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
    const route = getRoute(req)

    switch (route) {
      case 'generate':
        return handleGenerate(req, res)
      case 'embeddings':
        return handleEmbeddings(req, res)
      default:
        return res.status(404).json({ error: 'Not found' })
    }
  } catch (error) {
    console.error('AI error:', error)

    let errorMessage = 'AI処理中にエラーが発生しました。しばらく待ってから再度お試しください。'
    let statusCode = 500

    if (error instanceof Error) {
      if ('status' in error && (error as { status: number }).status === 429) {
        errorMessage = 'AIサービスが混み合っています。しばらく待ってから再度お試しください。'
        statusCode = 429
      } else if ('status' in error && (error as { status: number }).status === 401) {
        errorMessage = 'AIサービスの認証エラーが発生しました。'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'AIの応答がタイムアウトしました。再度お試しください。'
        statusCode = 504
      }
    }

    if (!res.headersSent) {
      return res.status(statusCode).json({ error: errorMessage })
    }

    try {
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
      res.end()
    } catch {
      // クライアント切断時
    }
  }
}
