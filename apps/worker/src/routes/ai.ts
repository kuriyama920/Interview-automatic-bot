/**
 * AI ルート
 * POST /api/ai/generate         - SSE ストリーミング回答生成
 * POST /api/ai/summarize        - 対話要約
 * POST /api/ai/prefetch-context - セッション開始時コンテキスト取得
 * POST /api/ai/embeddings       - Embedding ベクトル生成
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import {
  checkAndReserveUsage,
  adjustReservedUsage,
  recordUsage,
} from '../lib/usage'
import { generateEmbedding, generateEmbeddings, createOpenAIClient } from '../lib/openai'
import { getCachedOrGenerateEmbedding } from '../lib/embedding-cache'
import { getCachedProfile } from '../lib/profile-cache'
import { SYSTEM_PROMPT, SPECULATIVE_SYSTEM_PROMPT, wrapUserInput } from '../lib/prompts'
import { formatProfileContext } from '../lib/profile'
import { withSoftDeadline, RAG_SOFT_DEADLINE_MS } from '../lib/latency-budget'
import {
  validateGenerateRequest,
  validateSummarizeRequest,
  validateGenerateV2Request,
  validateEmbeddingsRequest,
  sanitizeTurnId,
  MODELS_WITH_REASONING,
  MAX_CONTEXT_LENGTH,
} from '../lib/ai-validation'
import { processOpenAIStream, mapOpenAIErrorToMessage, createSSEResponse, ERROR_MESSAGES } from '../lib/ai-streaming'
import type { SSEWriter } from '../lib/ai-streaming'
import { groupDocumentChunks, formatGroupedContext, deferDbWrite } from '../lib/ai-generate'
import { createRateLimiter } from '../middleware/rate-limit'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', authRequired)
app.use('*', createRateLimiter())

// --- Generate constants ---
const DEFAULT_TOP_K = 3
const DEFAULT_MIN_SIMILARITY = 0.7

// --- Summarize constants ---
const SUMMARIZE_SYSTEM_PROMPT =
  '面接の対話から候補者の主張・数値・エピソードを構造化して抽出・要約するアシスタントです。要約には必ず具体的な企業名・技術名・プロジェクト名・数値を保持し、指示語（これ・それ・あの等）は使用しないでください。'
const SUMMARIZE_MAX_TOKENS = 500
const SUMMARIZE_MODEL = 'gpt-5.4-nano'

const SPECULATIVE_MODEL = 'gpt-5-nano'
const COMMITTED_MODEL = 'gpt-5.4-nano'
const SPECULATIVE_MAX_TOKENS = 200
const COMMITTED_MAX_TOKENS = 800

interface MatchResultWithInfo {
  id: string
  content: string
  similarity: number
  document_id: string
  document_name: string
  document_type: string
}

function fetchDocumentContext(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  apiKey: string,
  userId: string,
  question: string,
  env?: { CF_ACCOUNT_ID?: string; CF_AI_GATEWAY_ID?: string },
  ctx?: ExecutionContext,
): Promise<string> {
  const inner = async (): Promise<string> => {
    const queryEmbedding = await getCachedOrGenerateEmbedding(question, apiKey, ctx, env)
    const { data: matches } = await supabase.rpc('match_documents_with_info', {
      query_embedding: queryEmbedding,
      match_threshold: DEFAULT_MIN_SIMILARITY,
      match_count: DEFAULT_TOP_K,
      p_user_id: userId,
    })
    if (!matches || matches.length === 0) return ''
    const items = (matches as MatchResultWithInfo[]).map((m) => ({
      key: m.document_id, type: m.document_type, name: m.document_name, content: m.content,
    }))
    return formatGroupedContext(groupDocumentChunks(items))
  }
  return withSoftDeadline(inner(), '', RAG_SOFT_DEADLINE_MS)
}

function getSafeExecutionCtx(c: { executionCtx: ExecutionContext }): ExecutionContext | undefined {
  try { return c.executionCtx } catch { return undefined }
}

/** DB書き込み用のバインド済みヘルパーを作成 */
function createDbWriteHelpers(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string,
) {
  return {
    adjust: (reserved: number, actual: number) =>
      adjustReservedUsage(supabase, userId, 'ai_tokens', reserved, actual),
    record: (amount: number, metadata: Record<string, unknown>) =>
      recordUsage(supabase, userId, 'ai_completion', amount, 'tokens', metadata, true),
  }
}

// ---------- /generate-v2 ----------

app.post('/generate-v2', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const validation = validateGenerateV2Request(body)
  if ('error' in validation) {
    return c.json({ error: validation.error }, 400)
  }

  const { question, phase, context, turnId } = validation

  const isSpeculative = phase === 'speculative'
  const model = isSpeculative ? SPECULATIVE_MODEL : COMMITTED_MODEL
  const maxTokens = isSpeculative ? SPECULATIVE_MAX_TOKENS : COMMITTED_MAX_TOKENS

  const m4_workerReceived = Date.now()

  const usagePromise = checkAndReserveUsage(supabase, userId, 'ai_tokens', maxTokens)

  const safeCtxV2 = getSafeExecutionCtx(c)

  const profilePromise = isSpeculative
    ? Promise.resolve(null as import('../lib/profile').InterviewProfile | null)
    : getCachedProfile(userId, supabase, safeCtxV2).catch(() => null)
  const docContextPromise = isSpeculative
    ? Promise.resolve('')
    : fetchDocumentContext(supabase, c.env.OPENAI_API_KEY, userId, question, c.env, safeCtxV2)

  const usage = await usagePromise
  const m5_usageCompleted = Date.now()

  if (!usage.allowed) {
    Promise.resolve(profilePromise).catch(() => {})
    docContextPromise.catch(() => {})
    return c.json(
      {
        error: ERROR_MESSAGES.USAGE_LIMIT,
        usage: { used: usage.used, limit: usage.limit, remaining: 0 },
      },
      429
    )
  }

  const contextResult = await Promise.all([profilePromise, docContextPromise]).catch(async () => {
    await adjustReservedUsage(supabase, userId, 'ai_tokens', maxTokens, 0).catch(() => {})
    return null
  })
  if (!contextResult) {
    return c.json({ error: 'コンテキストの取得に失敗しました' }, 500)
  }
  const [profileResult, docContext] = contextResult
  const m6_ragCompleted = Date.now()
  const m6_ragTimedOut = !isSpeculative && (m6_ragCompleted - m4_workerReceived) > RAG_SOFT_DEADLINE_MS

  const profileContext = isSpeculative
    ? ''
    : formatProfileContext(profileResult as import('../lib/profile').InterviewProfile | null)

  const instructions = isSpeculative
    ? SPECULATIVE_SYSTEM_PROMPT
    : profileContext
      ? `${SYSTEM_PROMPT}\n\n【候補者プロフィール】\n${profileContext}`
      : SYSTEM_PROMPT

  const input: Array<{ role: 'user'; content: string }> = []
  if (!isSpeculative && docContext) {
    input.push({ role: 'user', content: wrapUserInput('document_context', docContext) })
  }
  if (context) {
    input.push({ role: 'user', content: wrapUserInput('conversation_history', context) })
  }
  input.push({ role: 'user', content: wrapUserInput('interviewer_question', question) })

  const { adjust, record } = createDbWriteHelpers(supabase, userId)

  async function executeOpenAIStream(
    stream: SSEWriter,
    openai: ReturnType<typeof createOpenAIClient>,
  ): Promise<void> {
    const effectiveMaxTokens = MODELS_WITH_REASONING.includes(model)
      ? maxTokens + 300
      : maxTokens

    const m7_openaiCalled = Date.now()
    const openaiStream = await openai.responses.create({
      model,
      instructions,
      input,
      max_output_tokens: effectiveMaxTokens,
      ...(MODELS_WITH_REASONING.includes(model) && {
        reasoning: { effort: model === COMMITTED_MODEL ? 'none' as const : 'minimal' as const },
      }),
      ...(isSpeculative ? {} : { temperature: 0.7 }),
      store: false,
      stream: true as const,
    })

    const result = await processOpenAIStream(stream, openaiStream as AsyncIterable<{ type: string; delta?: string; response?: { id?: string; usage?: { total_tokens?: number } | null; error?: { message?: string } } }>, {
      turnId,
      phase,
      m4: m4_workerReceived,
      m5: m5_usageCompleted,
      m6: m6_ragCompleted,
      m6_timedOut: m6_ragTimedOut,
      m7: m7_openaiCalled,
    })

    await stream.writeSSE({
      data: JSON.stringify({
        type: 'done',
        tokensUsed: result.totalTokensUsed,
        responseId: result.responseId,
        phase,
        model,
      }),
    })

    deferDbWrite({
      adjustReservedUsage: adjust,
      recordUsage: record,
      reservedAmount: maxTokens,
      actualAmount: result.totalTokensUsed,
      metadata: { model, phase, questionLength: question.length },
      ctx: safeCtxV2,
    })
  }

  return createSSEResponse(async (stream) => {
    try {
      const openai = createOpenAIClient(c.env.OPENAI_API_KEY, c.env, 15_000)
      await executeOpenAIStream(stream, openai)
    } catch (error) {
      console.error('generate-v2 OpenAI error:', {
        phase,
        model,
        error: error instanceof Error ? { name: error.name, message: error.message, status: (error as unknown as Record<string, unknown>).status } : String(error),
      })

      await adjust(maxTokens, 0).catch(() => {})

      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', error: mapOpenAIErrorToMessage(error) }),
      })
    }
  }, safeCtxV2)
})

// ---------- /generate ----------

app.post('/generate', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const validation = validateGenerateRequest(body)
  if ('error' in validation) {
    return c.json({ error: validation.error }, 400)
  }

  const { question, context, includeDocumentContext, model, maxTokens, temperature } = validation

  const turnId = sanitizeTurnId(c.req.header('X-Turn-Id'))
  const m4_workerReceived = Date.now()
  const usagePromise = checkAndReserveUsage(supabase, userId, 'ai_tokens', maxTokens)
  const safeCtx = getSafeExecutionCtx(c)
  const profilePromise = getCachedProfile(userId, supabase, safeCtx).catch(() => null)
  const docContextPromise = includeDocumentContext
    ? fetchDocumentContext(supabase, c.env.OPENAI_API_KEY, userId, question, c.env, safeCtx)
    : Promise.resolve('')

  const usage = await usagePromise
  const m5_usageCompleted = Date.now()
  if (!usage.allowed) {
    Promise.resolve(profilePromise).catch(() => {})
    docContextPromise.catch(() => {})
    return c.json(
      {
        error: ERROR_MESSAGES.USAGE_LIMIT,
        usage: { used: usage.used, limit: usage.limit, remaining: 0 },
      },
      429
    )
  }

  const contextResult = await Promise.all([profilePromise, docContextPromise]).catch(async () => {
    await adjustReservedUsage(supabase, userId, 'ai_tokens', maxTokens, 0).catch(() => {})
    return null
  })
  if (!contextResult) {
    return c.json({ error: 'コンテキストの取得に失敗しました' }, 500)
  }
  const [profileResult, docContext] = contextResult
  const m6_ragCompleted = Date.now()
  const m6_ragTimedOut = (m6_ragCompleted - m4_workerReceived) > RAG_SOFT_DEADLINE_MS

  const profileContext = formatProfileContext(profileResult as import('../lib/profile').InterviewProfile | null)
  const instructions = profileContext
    ? `${SYSTEM_PROMPT}\n\n【候補者プロフィール】\n${profileContext}`
    : SYSTEM_PROMPT

  const input: Array<{ role: 'user'; content: string }> = []
  if (docContext) {
    input.push({ role: 'user', content: wrapUserInput('document_context', docContext) })
  }
  if (context) {
    input.push({ role: 'user', content: wrapUserInput('conversation_history', context) })
  }
  input.push({ role: 'user', content: wrapUserInput('interviewer_question', question) })

  const { adjust, record } = createDbWriteHelpers(supabase, userId)

  return createSSEResponse(async (stream) => {
    let totalTokensUsed = 0

    try {
      const openai = createOpenAIClient(c.env.OPENAI_API_KEY, c.env, 15_000)

      const m7_openaiCalled = Date.now()
      const effectiveMaxTokens = MODELS_WITH_REASONING.includes(model)
        ? maxTokens + 300
        : maxTokens

      const openaiStream = await openai.responses.create({
        model,
        instructions,
        input,
        max_output_tokens: effectiveMaxTokens,
        ...(MODELS_WITH_REASONING.includes(model) && {
          reasoning: { effort: model === COMMITTED_MODEL ? 'none' as const : 'minimal' as const },
        }),
        ...(temperature !== undefined && { temperature }),
        store: false,
        stream: true as const,
      })

      const result = await processOpenAIStream(stream, openaiStream as AsyncIterable<{ type: string; delta?: string; response?: { id?: string; usage?: { total_tokens?: number } | null; error?: { message?: string } } }>, {
        turnId,
        m4: m4_workerReceived,
        m5: m5_usageCompleted,
        m6: m6_ragCompleted,
        m6_timedOut: m6_ragTimedOut,
        m7: m7_openaiCalled,
      })

      totalTokensUsed = result.totalTokensUsed

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          tokensUsed: result.totalTokensUsed,
          responseId: result.responseId,
          model,
        }),
      })

      deferDbWrite({
        adjustReservedUsage: adjust,
        recordUsage: record,
        reservedAmount: maxTokens,
        actualAmount: result.totalTokensUsed,
        metadata: { model, questionLength: question.length },
        ctx: safeCtx,
      })
    } catch (error) {
      if (totalTokensUsed > 0) {
        console.warn('Stream interrupted with partial consumption', { totalTokensUsed, maxTokens })
      }
      await adjust(maxTokens, totalTokensUsed).catch(() => {})

      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', error: mapOpenAIErrorToMessage(error) }),
      })
    }
  }, safeCtx)
})

// ---------- /summarize ----------

app.post('/summarize', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const validation = validateSummarizeRequest(body)
  if ('error' in validation) {
    return c.json({ error: validation.error }, 400)
  }

  const { previousSummary, interviewer, candidate } = validation

  const summarizeUsage = await checkAndReserveUsage(
    supabase,
    userId,
    'ai_tokens',
    SUMMARIZE_MAX_TOKENS
  )
  if (!summarizeUsage.allowed) {
    return c.json(
      {
        error: ERROR_MESSAGES.USAGE_LIMIT,
        usage: { used: summarizeUsage.used, limit: summarizeUsage.limit, remaining: 0 },
      },
      429
    )
  }

  const wrappedInterviewer = wrapUserInput('interviewer', interviewer)
  const wrappedCandidate = wrapUserInput('candidate', candidate)
  const wrappedPreviousSummary = previousSummary ? wrapUserInput('previous_summary', previousSummary) : ''
  const userMessage = previousSummary
    ? `【現在の要約】\n${wrappedPreviousSummary}\n\n【新しい対話】\n${wrappedInterviewer}\n${wrappedCandidate}\n\n上記を統合した要約を出力してください。\n抽出必須: 企業名、技術名、PJ名、具体的数値、候補者の主張。\n使用済みエピソードを明記（例: 「○○PJでの△△経験を言及済み」）。\n300-500文字で出力。`
    : `【対話】\n${wrappedInterviewer}\n${wrappedCandidate}\n\n候補者の回答を要約してください。\n抽出必須: 企業名、技術名、PJ名、具体的数値、候補者の主張。\n使用済みエピソード: 「○○PJでの△△経験」の形式で記録。\n100-200文字で出力。`

  const { adjust, record } = createDbWriteHelpers(supabase, userId)

  try {
    const openai = createOpenAIClient(c.env.OPENAI_API_KEY, c.env, 10_000)
    const response = await openai.chat.completions.create({
      model: SUMMARIZE_MODEL,
      messages: [
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: SUMMARIZE_MAX_TOKENS,
      store: false,
    })

    const content = response.choices[0]?.message?.content || ''
    const tokensUsed = response.usage?.total_tokens || 0

    const safeCtxSummarize = getSafeExecutionCtx(c)
    deferDbWrite({
      adjustReservedUsage: adjust,
      recordUsage: record,
      reservedAmount: SUMMARIZE_MAX_TOKENS,
      actualAmount: tokensUsed,
      metadata: { model: SUMMARIZE_MODEL, type: 'summarize' },
      ctx: safeCtxSummarize,
    })

    return c.json({ success: true, summary: content.trim() })
  } catch (error) {
    await adjust(SUMMARIZE_MAX_TOKENS, 0).catch(() => {})
    console.error('Summarization failed:', error instanceof Error ? error.message : String(error))
    return c.json({ error: '要約生成に失敗しました。' }, 500)
  }
})

// ---------- /prefetch-context ----------

app.post('/prefetch-context', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('content, documents!inner (type, name)')
    .eq('user_id', userId)
    .is('documents.deleted_at', null)
    .in('documents.type', ['resume', 'job_posting', 'expected_qa'])

  if (error) {
    return c.json({ error: 'Failed to fetch document context' }, 500)
  }

  if (!chunks || chunks.length === 0) {
    return c.json({ success: true, context: '' })
  }

  const items = chunks.map((chunk) => {
    const doc = chunk.documents as unknown as { type: string; name: string }
    return {
      key: `${doc.type}:${doc.name}`,
      type: doc.type,
      name: doc.name,
      content: chunk.content,
    }
  })

  const contextText = formatGroupedContext(
    groupDocumentChunks(items),
    MAX_CONTEXT_LENGTH
  )

  return c.json({ success: true, context: contextText })
})

// ---------- /embeddings ----------

app.post('/embeddings', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const validation = validateEmbeddingsRequest(body)
  if ('error' in validation) {
    return c.json({ error: validation.error }, 400)
  }

  const { inputTexts } = validation
  const totalChars = inputTexts.reduce((sum, t) => sum + t.length, 0)
  const estimatedTokens = Math.ceil(totalChars * 0.5)

  const embeddingUsage = await checkAndReserveUsage(supabase, userId, 'ai_tokens', estimatedTokens)
  if (!embeddingUsage.allowed) {
    return c.json(
      {
        error: ERROR_MESSAGES.USAGE_LIMIT,
        usage: { used: embeddingUsage.used, limit: embeddingUsage.limit, remaining: 0 },
      },
      429
    )
  }

  try {
    const embeddings = inputTexts.length === 1
      ? [await generateEmbedding(inputTexts[0], c.env.OPENAI_API_KEY, c.env)]
      : await generateEmbeddings(inputTexts, c.env.OPENAI_API_KEY, c.env)

    await recordUsage(supabase, userId, 'embedding', estimatedTokens, 'tokens',
      { textCount: inputTexts.length, totalChars }, true)
    await adjustReservedUsage(supabase, userId, 'ai_tokens', estimatedTokens, estimatedTokens)

    return c.json({ success: true, embeddings })
  } catch (error) {
    await adjustReservedUsage(supabase, userId, 'ai_tokens', estimatedTokens, 0)
    console.error('Embedding generation failed:', error instanceof Error ? error.message : String(error))
    return c.json({ error: 'Failed to generate embeddings' }, 500)
  }
})

export default app
