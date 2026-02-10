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
import { checkUsageLimit, recordUsage, hasCustomApiKey } from '../../lib/usage'
import { supabaseAdmin } from '../../lib/supabase'
import { generateEmbedding } from '../../lib/openai'
import { getEnv } from '../../lib/env'

export const config = {
  maxDuration: 60,
}

const SYSTEM_PROMPT = `あなたは面接支援AIアシスタントです。面接官の質問に対して、候補者が答えるべき最適な回答を提案します。

以下のガイドラインに従ってください：
1. 簡潔で明確な回答を提供する
2. STAR法（Situation, Task, Action, Result）を意識した構造的な回答
3. 具体的なエピソードや数値を含める提案
4. ポジティブな表現を使用
5. 日本語で回答する

回答形式：
- メインの回答（2-3文）
- 補足ポイント（箇条書き2-3個）`

const DEFAULT_MODEL = 'gpt-5-mini'
const DEFAULT_MAX_TOKENS = 500
const DEFAULT_TEMPERATURE = 0.7
const MAX_QUESTION_LENGTH = 2000
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
  temperature: number
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
  const model = typeof data.model === 'string' ? data.model : DEFAULT_MODEL
  const maxTokens =
    typeof data.maxTokens === 'number' && data.maxTokens > 0 && data.maxTokens <= 4000
      ? data.maxTokens
      : DEFAULT_MAX_TOKENS
  const temperature =
    typeof data.temperature === 'number' && data.temperature >= 0 && data.temperature <= 2
      ? data.temperature
      : DEFAULT_TEMPERATURE

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

    if (!documents) return ''

    const docMap = new Map(documents.map((d) => [d.id, d]))

    // ドキュメントごとにグループ化
    const grouped = new Map<string, { label: string; chunks: string[] }>()

    for (const match of matches as MatchResult[]) {
      const doc = docMap.get(match.document_id)
      if (!doc) continue

      if (!grouped.has(match.document_id)) {
        const label = doc.type === 'resume' ? '履歴書' : '求人票'
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

    // カスタムキーがなければ使用量チェック
    if (!userHasCustomKey) {
      const usage = await checkUsageLimit(userId, 'ai_tokens')
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
      temperature,
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

    // トークン使用量を記録（カスタムキーでなければ）
    if (!userHasCustomKey && totalTokensUsed > 0) {
      await recordUsage(userId, 'ai_completion', totalTokensUsed, 'tokens', {
        model,
        questionLength: question.length,
      })
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
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`)
    res.end()
  }
}
