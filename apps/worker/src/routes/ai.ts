/**
 * AI ルート
 * POST /api/ai/generate         - SSE ストリーミング回答生成
 * POST /api/ai/summarize        - 対話要約
 * POST /api/ai/prefetch-context - セッション開始時コンテキスト取得
 * POST /api/ai/embeddings       - Embedding ベクトル生成
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import OpenAI from 'openai'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import {
  checkAndReserveUsage,
  adjustReservedUsage,
  recordUsage,
} from '../lib/usage'
import { generateEmbedding, generateEmbeddings } from '../lib/openai'
import { SYSTEM_PROMPT } from '../lib/prompts'
import { formatProfileContext } from '../lib/profile'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', authRequired)

// --- Generate constants ---

// gpt-5-nano (minimal): TTFT ~0.77s — reasoning_effort:'minimal'で推論トークンほぼゼロ
// gpt-4o-mini: TTFT ~3.1s — 非reasoningだがTTFTが遅い
// gpt-5-nano (low/high): TTFT 1-100s+ — reasoning_effortが高いほど遅い
const DEFAULT_MODEL = 'gpt-5-nano'
const DEFAULT_MAX_TOKENS = 800
const MAX_QUESTION_LENGTH = 2000
const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-nano', 'gpt-5-mini']
// gpt-4o-mini, gpt-4.1-mini/nano: 非reasoning、temperature対応
// gpt-5-nano/mini: reasoning常時ON、temperature非対応
const MODELS_WITHOUT_TEMPERATURE = ['gpt-5-nano', 'gpt-5-mini']
const MODELS_WITH_REASONING = ['gpt-5-nano', 'gpt-5-mini']
const DEFAULT_TOP_K = 3
const DEFAULT_MIN_SIMILARITY = 0.7
const MAX_CONTEXT_LENGTH = 30000
const MAX_PREDICTED_ANSWER_LENGTH = 5000

const CASCADING_QUICK_MODEL = 'gpt-5-nano' // minimal reasoning → TTFT ~0.77s（gpt-4o-miniの~3.1sより4倍速い）

const CASCADING_QUICK_PROMPT = `面接官の質問に対して、まずどう切り出せばいいか1文でアドバイスして。
- 面接で実際に口に出せる自然な話し言葉
- 「です・ます」調
- 方向性がわかる具体的な一言（抽象的にならない）`

// --- Embeddings constants ---

const MAX_TEXTS = 20
const MAX_TEXT_LENGTH = 8000

// --- Summarize constants ---

const SUMMARIZE_SYSTEM_PROMPT =
  '面接の対話から候補者の主張・数値・エピソードを構造化して抽出・要約するアシスタントです。要約には必ず具体的な企業名・技術名・プロジェクト名・数値を保持し、指示語（これ・それ・あの等）は使用しないでください。'
const SUMMARIZE_MAX_TOKENS = 300
const MAX_SUMMARY_INPUT_LENGTH = 1000
const MAX_TURN_TEXT_LENGTH = 5000

// --- Validation ---

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
  predictedAnswer: string | undefined
  cascading: boolean
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
  if (context && context.length > MAX_CONTEXT_LENGTH) {
    return { error: `context must be less than ${MAX_CONTEXT_LENGTH} characters` }
  }
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

  const predictedAnswer =
    typeof data.predictedAnswer === 'string' && data.predictedAnswer.length > 0
      ? data.predictedAnswer.substring(0, MAX_PREDICTED_ANSWER_LENGTH)
      : undefined

  const cascading = data.cascading === true

  return { question, context, includeDocumentContext, model, maxTokens, temperature, predictedAnswer, cascading }
}

interface ValidatedSummarizeRequest {
  previousSummary: string
  interviewer: string
  candidate: string
}

function validateSummarizeRequest(body: unknown): ValidatedSummarizeRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  if (!data.interviewer || typeof data.interviewer !== 'string') {
    return { error: 'interviewer is required and must be a string' }
  }
  if (!data.candidate || typeof data.candidate !== 'string') {
    return { error: 'candidate is required and must be a string' }
  }

  const interviewer = data.interviewer.trim()
  const candidate = data.candidate.trim()
  const previousSummary =
    typeof data.previousSummary === 'string' ? data.previousSummary.trim() : ''

  if (interviewer.length > MAX_TURN_TEXT_LENGTH) {
    return { error: `interviewer must be less than ${MAX_TURN_TEXT_LENGTH} characters` }
  }
  if (candidate.length > MAX_TURN_TEXT_LENGTH) {
    return { error: `candidate must be less than ${MAX_TURN_TEXT_LENGTH} characters` }
  }
  if (previousSummary.length > MAX_SUMMARY_INPUT_LENGTH) {
    return { error: `previousSummary must be less than ${MAX_SUMMARY_INPUT_LENGTH} characters` }
  }

  return { previousSummary, interviewer, candidate }
}

// --- Document context fetching ---

const RAG_TIMEOUT_MS = 2000 // RAG取得のタイムアウト（2秒）

async function fetchDocumentContext(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  apiKey: string,
  userId: string,
  question: string
): Promise<string> {
  try {
    // RAGにタイムアウトを設定（遅延時はスキップして生成を優先）
    const result = await Promise.race([
      fetchDocumentContextInner(supabase, apiKey, userId, question),
      new Promise<string>((resolve) =>
        setTimeout(() => {
          console.warn('RAG context fetch timed out, skipping')
          resolve('')
        }, RAG_TIMEOUT_MS)
      ),
    ])
    return result
  } catch (error) {
    console.error('Failed to fetch document context:', error)
    return ''
  }
}

async function fetchDocumentContextInner(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  apiKey: string,
  userId: string,
  question: string
): Promise<string> {
  const queryEmbedding = await generateEmbedding(question, apiKey)

  const { data: matches } = await supabase.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_threshold: DEFAULT_MIN_SIMILARITY,
    match_count: DEFAULT_TOP_K,
    p_user_id: userId,
    p_document_types: null,
  })

  if (!matches || matches.length === 0) return ''

  const documentIds = [...new Set((matches as MatchResult[]).map((m) => m.document_id))]
  const { data: documents } = await supabase
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
}

// --- POST /api/ai/generate (SSE) ---

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

  const { question, context, includeDocumentContext, model, maxTokens, temperature, predictedAnswer, cascading } = validation

  const serverStartTime = Date.now()

  // 最適化: usage check を先行実行し、profile + RAG は並列で取得
  // usage check が最速で完了するため、NGなら即座に429を返せる
  const usagePromise = checkAndReserveUsage(supabase, userId, 'ai_tokens', maxTokens)
  const profilePromise = supabase.from('profiles').select('interview_profile').eq('id', userId).single()
  const docContextPromise = includeDocumentContext
    ? fetchDocumentContext(supabase, c.env.OPENAI_API_KEY, userId, question)
    : Promise.resolve('')

  // usage check を最優先で待つ（最も高速、NG時は他のPromiseを待たない）
  const usage = await usagePromise
  if (!usage.allowed) {
    // 先行実行済みPromiseの未ハンドル拒否を防止
    profilePromise.catch(() => {})
    docContextPromise.catch(() => {})
    return c.json(
      {
        error:
          '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: usage.used, limit: usage.limit, remaining: 0 },
      },
      429
    )
  }

  // profile + RAG を並列で待つ（usage check中に既に実行開始済み）
  const [profileResult, docContext] = await Promise.all([profilePromise, docContextPromise])
  const prepMs = Date.now() - serverStartTime
  console.debug(`[perf] Prep phase: ${prepMs}ms (usage+profile+RAG)`, { includeDocumentContext, docContextLen: docContext.length })

  const profileContext = formatProfileContext(profileResult.data?.interview_profile)

  // Prompt Caching最適化: 静的プレフィックスを先頭に配置し、動的部分を末尾に
  // OpenAI は先頭1024+トークンの安定プレフィックスを自動キャッシュ → TTFT最大80%削減
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
  ]
  if (profileContext) {
    messages.push({ role: 'user', content: `【候補者プロフィール】\n${profileContext}` })
  }
  if (docContext) {
    messages.push({ role: 'user', content: `【参考資料】\n${docContext}` })
  }
  if (context) {
    messages.push({ role: 'user', content: `【これまでの対話】\n${context}` })
  }
  messages.push({ role: 'user', content: `面接官の質問: ${question}` })

  // SSEバッファリング防止: Cloudflare/プロキシがレスポンスをバッファリングして
  // 一括送信するのを防ぐ。これがないとストリーミングが「一発で出力」される原因になる
  c.header('X-Accel-Buffering', 'no')
  c.header('Cache-Control', 'no-cache, no-transform')

  return streamSSE(c, async (stream) => {
    let totalTokensUsed = 0
    let fullContent = ''

    try {
      const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY, timeout: 15_000 })

      // Cascading Phase 1: 軽量プロンプトで即座に方向性を返す
      if (cascading) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'phase', phase: 'quick' }),
        })

        const quickStream = await openai.chat.completions.create({
          model: CASCADING_QUICK_MODEL,
          messages: [
            { role: 'system', content: CASCADING_QUICK_PROMPT },
            { role: 'user', content: `面接官の質問: ${question}` },
          ],
          max_completion_tokens: 200,
          reasoning_effort: 'minimal' as const,
          stream: true,
          stream_options: { include_usage: true },
          store: false,
        })

        for await (const chunk of quickStream) {
          const content = chunk.choices[0]?.delta?.content || ''
          if (content) {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'chunk', content }),
            })
          }
          if (chunk.usage) {
            totalTokensUsed += chunk.usage.total_tokens
          }
        }

        // Phase 2 への切り替え
        await stream.writeSSE({
          data: JSON.stringify({ type: 'phase', phase: 'detailed' }),
        })
      }

      // Phase 2（または cascading=false の場合は通常生成）
      // Reasoningモデルはmax_completion_tokensに思考トークンも含まれるため、
      // 出力が途切れないよう余裕を持たせる（+300トークン）
      const effectiveMaxTokens = MODELS_WITH_REASONING.includes(model)
        ? maxTokens + 300
        : maxTokens
      const openaiStream = await openai.chat.completions.create({
        model,
        messages,
        max_completion_tokens: effectiveMaxTokens,
        ...(MODELS_WITH_REASONING.includes(model) && { reasoning_effort: 'minimal' as const }),
        ...(temperature !== undefined && { temperature }),
        ...(predictedAnswer && { prediction: { type: 'content' as const, content: predictedAnswer } }),
        stream: true,
        stream_options: { include_usage: true },
        store: false,
        service_tier: 'auto' as const,
      })

      for await (const chunk of openaiStream) {
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          fullContent += content
          await stream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content }),
          })
        }
        if (chunk.usage) {
          totalTokensUsed += chunk.usage.total_tokens
        }
      }

      await adjustReservedUsage(supabase, userId, 'ai_tokens', maxTokens, totalTokensUsed)
      if (totalTokensUsed > 0) {
        await recordUsage(
          supabase,
          userId,
          'ai_completion',
          totalTokensUsed,
          'tokens',
          { model, questionLength: question.length },
          true
        )
      }

      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          tokensUsed: totalTokensUsed,
        }),
      })
    } catch (error) {
      // ストリーム中断時: 実際に消費されたトークン分を計上（0の場合は全額返却）
      if (totalTokensUsed > 0) {
        console.warn('Stream interrupted with partial consumption', { totalTokensUsed, maxTokens })
      }
      await adjustReservedUsage(supabase, userId, 'ai_tokens', maxTokens, totalTokensUsed).catch(() => {})

      let errorMessage = 'AI処理中にエラーが発生しました。しばらく待ってから再度お試しください。'
      if (error instanceof Error) {
        if ('status' in error && (error as { status: number }).status === 429) {
          errorMessage = 'AIサービスが混み合っています。しばらく待ってから再度お試しください。'
        } else if ('status' in error && (error as { status: number }).status === 401) {
          errorMessage = 'AIサービスの認証エラーが発生しました。'
        } else if (error.message.includes('timeout')) {
          errorMessage = 'AIの応答がタイムアウトしました。再度お試しください。'
        }
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', error: errorMessage }),
      })
    }
  })
})

// --- POST /api/ai/summarize ---

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
        error: '今月のAIトークン上限に達しました。',
        usage: { used: summarizeUsage.used, limit: summarizeUsage.limit, remaining: 0 },
      },
      429
    )
  }

  const userMessage = previousSummary
    ? `【現在の要約】\n${previousSummary}\n\n【新しい対話】\n面接官: ${interviewer}\n候補者: ${candidate}\n\n上記を統合した要約を出力してください。\n抽出必須: 企業名、技術名、PJ名、具体的数値、候補者の主張。\n使用済みエピソードを明記（例: 「○○PJでの△△経験を言及済み」）。\n100-200文字で簡潔に。`
    : `【対話】\n面接官: ${interviewer}\n候補者: ${candidate}\n\n候補者の回答を要約してください。\n抽出必須: 企業名、技術名、PJ名、具体的数値、候補者の主張。\n使用済みエピソード: 「○○PJでの△△経験」の形式で記録。\n50-100文字で簡潔に。`

  try {
    const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY, timeout: 10_000 })
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      messages: [
        { role: 'system', content: SUMMARIZE_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      max_completion_tokens: SUMMARIZE_MAX_TOKENS,
      reasoning_effort: 'minimal' as const,
      store: false,
    })

    const content = response.choices[0]?.message?.content || ''
    const tokensUsed = response.usage?.total_tokens || 0

    await adjustReservedUsage(supabase, userId, 'ai_tokens', SUMMARIZE_MAX_TOKENS, tokensUsed)
    if (tokensUsed > 0) {
      await recordUsage(
        supabase,
        userId,
        'ai_completion',
        tokensUsed,
        'tokens',
        { model: DEFAULT_MODEL, type: 'summarize' },
        true
      )
    }

    return c.json({ success: true, summary: content.trim() })
  } catch (error) {
    await adjustReservedUsage(supabase, userId, 'ai_tokens', SUMMARIZE_MAX_TOKENS, 0).catch(
      () => {}
    )
    console.error('Summarization failed:', error)
    return c.json({ error: '要約生成に失敗しました。' }, 500)
  }
})

// --- POST /api/ai/prefetch-context ---

app.post('/prefetch-context', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const { data: chunks, error } = await supabase
    .from('document_chunks')
    .select('content, documents!inner (type, name)')
    .eq('user_id', userId)
    .in('documents.type', ['resume', 'job_posting'])

  if (error) {
    return c.json({ error: 'Failed to fetch document context' }, 500)
  }

  if (!chunks || chunks.length === 0) {
    return c.json({ success: true, context: '' })
  }

  const grouped = new Map<string, { label: string; chunks: string[] }>()
  for (const chunk of chunks) {
    const doc = chunk.documents as unknown as { type: string; name: string }
    const key = `${doc.type}:${doc.name}`
    if (!grouped.has(key)) {
      const labelMap: Record<string, string> = { resume: '履歴書', job_posting: '求人票' }
      const label = labelMap[doc.type] || doc.type
      grouped.set(key, { label: `${label}: ${doc.name}`, chunks: [] })
    }
    grouped.get(key)!.chunks.push(chunk.content)
  }

  const contextText = Array.from(grouped.values())
    .map((g) => `【${g.label}】\n${g.chunks.join('\n')}`)
    .join('\n\n')
    .slice(0, MAX_CONTEXT_LENGTH)

  return c.json({ success: true, context: contextText })
})

// --- POST /api/ai/embeddings ---

app.post('/embeddings', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  let body: { text?: string; texts?: string[] }
  try {
    body = await c.req.json<{ text?: string; texts?: string[] }>()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  const { text, texts } = body

  if (!text && !texts) {
    return c.json({ error: 'text or texts is required' }, 400)
  }

  let inputTexts: string[]

  if (text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return c.json({ error: 'text must be a non-empty string' }, 400)
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return c.json({ error: `text must be less than ${MAX_TEXT_LENGTH} characters` }, 400)
    }
    inputTexts = [text]
  } else {
    if (!Array.isArray(texts) || texts.length === 0) {
      return c.json({ error: 'texts must be a non-empty array' }, 400)
    }
    if (texts.length > MAX_TEXTS) {
      return c.json({ error: `texts must have at most ${MAX_TEXTS} items` }, 400)
    }
    for (const t of texts) {
      if (typeof t !== 'string' || t.trim().length === 0) {
        return c.json({ error: 'Each text must be a non-empty string' }, 400)
      }
      if (t.length > MAX_TEXT_LENGTH) {
        return c.json({ error: `Each text must be less than ${MAX_TEXT_LENGTH} characters` }, 400)
      }
    }
    inputTexts = texts
  }

  const totalChars = inputTexts.reduce((sum, t) => sum + t.length, 0)
  const estimatedTokens = Math.ceil(totalChars * 0.5)

  const embeddingUsage = await checkAndReserveUsage(supabase, userId, 'ai_tokens', estimatedTokens)
  if (!embeddingUsage.allowed) {
    return c.json(
      {
        error:
          '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: embeddingUsage.used, limit: embeddingUsage.limit, remaining: 0 },
      },
      429
    )
  }

  try {
    let embeddings: number[][]

    if (inputTexts.length === 1) {
      const embedding = await generateEmbedding(inputTexts[0], c.env.OPENAI_API_KEY)
      embeddings = [embedding]
    } else {
      embeddings = await generateEmbeddings(inputTexts, c.env.OPENAI_API_KEY)
    }

    await recordUsage(
      supabase,
      userId,
      'embedding',
      estimatedTokens,
      'tokens',
      { textCount: inputTexts.length, totalChars },
      true
    )
    await adjustReservedUsage(supabase, userId, 'ai_tokens', estimatedTokens, estimatedTokens)

    return c.json({ success: true, embeddings })
  } catch (error) {
    await adjustReservedUsage(supabase, userId, 'ai_tokens', estimatedTokens, 0)
    console.error('Embedding generation failed:', error)
    throw new Error('Failed to generate embeddings')
  }
})

export default app
