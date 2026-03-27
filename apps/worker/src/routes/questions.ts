/**
 * 想定質問ルート
 * GET    /api/questions          - Q&A一覧取得
 * POST   /api/questions          - Q&Aバッチ保存
 * DELETE /api/questions/:id      - 質問削除
 * POST   /api/questions/generate - AI質問一括生成（SSE）
 * POST   /api/questions/answer   - AI回答補完（SSE）
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import { generateEmbeddings, createOpenAIClient } from '../lib/openai'
import { isValidUUID } from '../lib/validation'
import { invalidateEmbeddingCache, invalidateEmbeddingCacheBatch } from '../lib/embedding-cache'
import { checkUsageLimit, checkAndReserveUsage, adjustReservedUsage, recordUsage } from '../lib/usage'
import { getCachedProfile } from '../lib/profile-cache'
import { formatProfileContext } from '../lib/profile'
import { createSSEResponse, mapOpenAIErrorToMessage, ERROR_MESSAGES } from '../lib/ai-streaming'
import { QUESTION_GENERATION_SYSTEM_PROMPT, ANSWER_GENERATION_SYSTEM_PROMPT, wrapUserInput } from '../lib/prompts'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', authRequired)

const MAX_QUESTIONS = 20
const MAX_QUESTION_LENGTH = 500
const MAX_ANSWER_LENGTH = 2000

const GENERATE_RESERVED_TOKENS = 10000
const GENERATE_MAX_OUTPUT_TOKENS = 8000
const ANSWER_RESERVED_TOKENS = 2000
const ANSWER_MAX_OUTPUT_TOKENS = 1000

interface QuestionInput {
  id?: string
  question: string
  answer: string
  sortOrder: number
}

interface DbQuestion {
  id: string
  question: string
  answer: string
  sort_order: number
  is_auto_generated: boolean
  chunk_id: string | null
  created_at: string
  updated_at: string
}

function validateQuestionsInput(body: unknown): QuestionInput[] | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  if (!Array.isArray(data.questions)) {
    return { error: 'questions must be an array' }
  }

  if (data.questions.length > MAX_QUESTIONS) {
    return { error: `Maximum ${MAX_QUESTIONS} questions allowed` }
  }

  const questions: QuestionInput[] = []

  for (let i = 0; i < data.questions.length; i++) {
    const q = data.questions[i] as Record<string, unknown>

    if (!q || typeof q !== 'object') {
      return { error: `questions[${i}] must be an object` }
    }

    if (typeof q.question !== 'string' || q.question.trim().length === 0) {
      return { error: `questions[${i}].question is required` }
    }

    if (q.question.length > MAX_QUESTION_LENGTH) {
      return { error: `questions[${i}].question must be less than ${MAX_QUESTION_LENGTH} characters` }
    }

    const answer = typeof q.answer === 'string' ? q.answer : ''
    if (answer.length > MAX_ANSWER_LENGTH) {
      return { error: `questions[${i}].answer must be less than ${MAX_ANSWER_LENGTH} characters` }
    }

    const sortOrder = typeof q.sortOrder === 'number' ? q.sortOrder : i
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder >= MAX_QUESTIONS) {
      return { error: `questions[${i}].sortOrder must be an integer between 0 and ${MAX_QUESTIONS - 1}` }
    }

    questions.push({
      id: typeof q.id === 'string' ? q.id : undefined,
      question: q.question.trim(),
      answer: answer.trim(),
      sortOrder,
    })
  }

  return questions
}

async function getOrCreateVirtualDocument(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  userId: string
): Promise<string> {
  const { data: existing } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expected_qa')
    .is('deleted_at', null)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabase
    .from('documents')
    .insert({
      user_id: userId,
      name: '想定質問',
      type: 'expected_qa',
      storage_path: `virtual/expected_qa/${userId}`,
      status: 'ready',
      file_size_bytes: 0,
      chunk_count: 0,
    })
    .select('id')
    .single()

  if (error || !created) {
    throw new Error('Failed to create virtual document for Q&A')
  }

  return created.id
}

async function syncEmbeddings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  apiKey: string,
  userId: string,
  documentId: string,
  questions: Array<{ id: string; question: string; answer: string }>
): Promise<Map<string, string>> {
  const chunkIdMap = new Map<string, string>()

  const questionsWithAnswers = questions.filter((q) => q.answer.trim().length > 0)

  if (questionsWithAnswers.length === 0) {
    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId)

    await supabase
      .from('documents')
      .update({ chunk_count: 0 })
      .eq('id', documentId)

    return chunkIdMap
  }

  const texts = questionsWithAnswers.map((q) => `質問: ${q.question}\n回答: ${q.answer}`)

  const embeddings = await generateEmbeddings(texts, apiKey)

  await supabase
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  const chunkInserts = questionsWithAnswers.map((q, index) => ({
    document_id: documentId,
    user_id: userId,
    content: texts[index],
    chunk_index: index,
    embedding: `[${embeddings[index].join(',')}]`,
  }))

  const { data: insertedChunks, error } = await supabase
    .from('document_chunks')
    .insert(chunkInserts)
    .select('id, chunk_index')

  if (error) {
    throw new Error('Failed to save Q&A embeddings')
  }

  if (insertedChunks) {
    for (const chunk of insertedChunks) {
      const question = questionsWithAnswers[chunk.chunk_index]
      if (question) {
        chunkIdMap.set(question.id, chunk.id)
      }
    }
  }

  await supabase
    .from('documents')
    .update({ chunk_count: questionsWithAnswers.length })
    .eq('id', documentId)

  return chunkIdMap
}

// --- GET /api/questions ---

app.get('/', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const { data: questions, error } = await supabase
    .from('interview_questions')
    .select('id, question, answer, sort_order, is_auto_generated, created_at, updated_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .limit(MAX_QUESTIONS)

  if (error) {
    return c.json({ success: false, error: 'Failed to fetch questions' }, 500)
  }

  return c.json({
    success: true,
    questions: (questions as DbQuestion[]).map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      sortOrder: q.sort_order,
      isAutoGenerated: q.is_auto_generated,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
    })),
  })
})

// --- POST /api/questions ---

app.post('/', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json()

  const validation = validateQuestionsInput(body)
  if ('error' in validation) {
    return c.json({ success: false, error: validation.error }, 400)
  }

  const inputQuestions = validation

  const hasAnswers = inputQuestions.some((q) => q.answer.trim().length > 0)
  if (hasAnswers) {
    const crudUsage = await checkUsageLimit(supabase, userId, 'ai_tokens')
    if (!crudUsage.allowed) {
      return c.json(
        {
          success: false,
          error: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
          usage: { used: crudUsage.used, limit: crudUsage.limit, remaining: 0 },
        },
        429
      )
    }
  }

  const documentId = await getOrCreateVirtualDocument(supabase, userId)

  const { data: existingQuestions } = await supabase
    .from('interview_questions')
    .select('id')
    .eq('user_id', userId)

  const existingIds = (existingQuestions ?? []).map((q) => q.id)

  if (inputQuestions.length === 0) {
    if (existingIds.length > 0) {
      await supabase.from('interview_questions').delete().in('id', existingIds)
    }

    await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId)

    await supabase.from('documents').update({ chunk_count: 0 }).eq('id', documentId)

    return c.json({ success: true, questions: [] })
  }

  const inserts = inputQuestions.map((q) => ({
    user_id: userId,
    question: q.question,
    answer: q.answer,
    sort_order: q.sortOrder,
    is_auto_generated: false,
  }))

  const { data: savedQuestions, error: insertError } = await supabase
    .from('interview_questions')
    .insert(inserts)
    .select('id, question, answer, sort_order, is_auto_generated, created_at, updated_at')

  if (insertError || !savedQuestions) {
    return c.json({ success: false, error: 'Failed to save questions' }, 500)
  }

  if (existingIds.length > 0) {
    await supabase.from('interview_questions').delete().in('id', existingIds)
  }

  // Fetch old chunk contents for cache invalidation before syncEmbeddings replaces them
  const { data: oldChunks } = await supabase
    .from('document_chunks')
    .select('content')
    .eq('document_id', documentId)
    .eq('user_id', userId)

  const chunkIdMap = await syncEmbeddings(
    supabase,
    c.env.OPENAI_API_KEY,
    userId,
    documentId,
    (savedQuestions as DbQuestion[]).map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
    }))
  )

  await Promise.all(
    Array.from(chunkIdMap.entries()).map(([questionId, chunkId]) =>
      supabase.from('interview_questions').update({ chunk_id: chunkId }).eq('id', questionId)
    )
  )

  // Invalidate embedding cache for old chunks (background, non-blocking)
  if (oldChunks && oldChunks.length > 0) {
    const oldContents = oldChunks.map((ch) => ch.content)
    try {
      const ctx = c.executionCtx
      ctx.waitUntil(invalidateEmbeddingCacheBatch(oldContents))
    } catch {
      // executionCtx may not be available in tests; fall through
    }
  }

  return c.json({
    success: true,
    questions: (savedQuestions as DbQuestion[]).map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      sortOrder: q.sort_order,
      isAutoGenerated: q.is_auto_generated,
      createdAt: q.created_at,
      updatedAt: q.updated_at,
    })),
  })
})

// --- DELETE /api/questions/:id ---

app.delete('/:id', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const questionId = c.req.param('id')

  if (!isValidUUID(questionId)) {
    return c.json({ success: false, error: 'Invalid question ID format' }, 400)
  }

  const { data: question, error: fetchError } = await supabase
    .from('interview_questions')
    .select('id, user_id, chunk_id')
    .eq('id', questionId)
    .single()

  if (fetchError || !question) {
    return c.json({ success: false, error: 'Question not found' }, 404)
  }

  if (question.user_id !== userId) {
    return c.json({ success: false, error: 'Access denied' }, 403)
  }

  // Fetch chunk content before deletion for cache invalidation
  let chunkContent: string | null = null
  if (question.chunk_id) {
    const { data: chunk } = await supabase
      .from('document_chunks')
      .select('content')
      .eq('id', question.chunk_id)
      .eq('user_id', userId)
      .single()
    chunkContent = chunk?.content ?? null

    await supabase
      .from('document_chunks')
      .delete()
      .eq('id', question.chunk_id)
      .eq('user_id', userId)
  }

  const { error: deleteError } = await supabase
    .from('interview_questions')
    .delete()
    .eq('id', questionId)
    .eq('user_id', userId)

  if (deleteError) {
    return c.json({ success: false, error: 'Failed to delete question' }, 500)
  }

  // Invalidate embedding cache for deleted chunk (background, non-blocking)
  if (chunkContent) {
    try {
      const ctx = c.executionCtx
      ctx.waitUntil(invalidateEmbeddingCache(chunkContent))
    } catch {
      // executionCtx may not be available in tests; fall through
    }
  }

  const { data: virtualDoc } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expected_qa')
    .is('deleted_at', null)
    .single()

  if (virtualDoc) {
    const { count } = await supabase
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', virtualDoc.id)
      .eq('user_id', userId)

    await supabase.from('documents').update({ chunk_count: count ?? 0 }).eq('id', virtualDoc.id)
  }

  return c.json({ success: true })
})

// --- POST /api/questions/generate ---

/**
 * executionCtx を安全に取得するヘルパー
 * テスト環境では executionCtx が存在しないため undefined を返す
 */
function getExecutionCtx(c: { executionCtx: ExecutionContext }): ExecutionContext | undefined {
  try {
    return c.executionCtx
  } catch {
    return undefined
  }
}

app.post('/generate', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const ctx = getExecutionCtx(c)

  // 1. 使用量チェック
  const usage = await checkAndReserveUsage(supabase, userId, 'ai_tokens', GENERATE_RESERVED_TOKENS, ctx)
  if (!usage.allowed) {
    return c.json({ success: false, error: ERROR_MESSAGES.USAGE_LIMIT }, 429)
  }

  // 2. プロフィール取得
  const profile = await getCachedProfile(userId, supabase, ctx)
  const profileContext = formatProfileContext(profile)

  // 3. 履歴書チャンク取得
  const { data: resumeDocs } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'resume')
    .is('deleted_at', null)

  if (!resumeDocs || resumeDocs.length === 0) {
    await adjustReservedUsage(supabase, userId, 'ai_tokens', GENERATE_RESERVED_TOKENS, 0)
    return c.json({ success: false, error: '履歴書をアップロードしてください' }, 400)
  }

  const docIds = resumeDocs.map((d: { id: string }) => d.id)
  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('content')
    .in('document_id', docIds)
    .eq('user_id', userId)
    .order('chunk_index', { ascending: true })

  const resumeContext = (chunks ?? []).map((ch: { content: string }) => ch.content).join('\n\n')

  // 4. SSEストリーミングで質問生成
  return createSSEResponse(async (stream) => {
    try {
      const openai = createOpenAIClient(c.env.OPENAI_API_KEY)
      const input = [
        { role: 'user' as const, content: wrapUserInput('candidate_profile', profileContext) },
        { role: 'user' as const, content: wrapUserInput('resume', resumeContext) },
        { role: 'user' as const, content: '上記の情報をもとに、想定質問と模範回答を20件生成してください。' },
      ]

      const response = await openai.responses.create({
        model: 'gpt-5.4-nano',
        instructions: QUESTION_GENERATION_SYSTEM_PROMPT,
        input,
        max_output_tokens: GENERATE_MAX_OUTPUT_TOKENS,
        store: false,
        stream: true,
      })

      let fullText = ''
      let totalTokens = 0
      let questionCount = 0

      for await (const event of response as AsyncIterable<{ type: string; delta?: string; response?: { usage?: { total_tokens?: number } } }>) {
        if (event.type === 'response.output_text.delta' && event.delta) {
          fullText += event.delta

          // <question>...</question> パターンを検出して1問ずつ送信
          const regex = /<question>(.*?)<\/question>/gs
          let match
          while ((match = regex.exec(fullText)) !== null) {
            const matchEnd = match.index + match[0].length
            try {
              const parsed = JSON.parse(match[1])
              questionCount++
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'question',
                  data: { index: questionCount - 1, question: parsed.question, answer: parsed.answer },
                }),
              })
            } catch {
              // 不正なJSON: スキップして次へ
            }
            // 成否に関わらず処理済み部分を除去
            fullText = fullText.slice(matchEnd)
            regex.lastIndex = 0
          }
        } else if (event.type === 'response.completed') {
          totalTokens = event.response?.usage?.total_tokens ?? 0
        }
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: 'done', data: { total: questionCount, tokens: totalTokens } }),
      })

      // 使用量調整（バックグラウンド）
      const adjustPromise = adjustReservedUsage(supabase, userId, 'ai_tokens', GENERATE_RESERVED_TOKENS, totalTokens)
      const recordPromise = recordUsage(supabase, userId, 'ai_completion', totalTokens, 'tokens', { feature: 'question_generation' })

      if (ctx) {
        ctx.waitUntil(Promise.all([adjustPromise, recordPromise]))
      } else {
        await Promise.all([adjustPromise, recordPromise])
      }
    } catch (error) {
      const message = mapOpenAIErrorToMessage(error)
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', data: { message } }),
        })
      } catch {
        // ストリームが既にクローズされている場合は無視
      }
      // 予約は必ず解放
      const releasePromise = adjustReservedUsage(supabase, userId, 'ai_tokens', GENERATE_RESERVED_TOKENS, 0)
      if (ctx) {
        ctx.waitUntil(releasePromise)
      } else {
        await releasePromise
      }
    }
  }, ctx)
})

// --- POST /api/questions/answer ---

app.post('/answer', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json()
  const answerCtx = getExecutionCtx(c)

  // バリデーション
  const question = body?.question
  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return c.json({ success: false, error: 'question is required' }, 400)
  }
  if (question.length > 500) {
    return c.json({ success: false, error: 'question must be less than 500 characters' }, 400)
  }

  // 使用量チェック
  const usage = await checkAndReserveUsage(supabase, userId, 'ai_tokens', ANSWER_RESERVED_TOKENS, answerCtx)
  if (!usage.allowed) {
    return c.json({ success: false, error: ERROR_MESSAGES.USAGE_LIMIT }, 429)
  }

  // プロフィール取得
  const profile = await getCachedProfile(userId, supabase, answerCtx)
  const profileContext = formatProfileContext(profile)

  // 履歴書コンテキスト取得
  const { data: resumeDocs } = await supabase
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'resume')
    .is('deleted_at', null)

  let resumeContext = ''
  if (resumeDocs && resumeDocs.length > 0) {
    const docIds = resumeDocs.map((d: { id: string }) => d.id)
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('content')
      .in('document_id', docIds)
      .eq('user_id', userId)
      .order('chunk_index', { ascending: true })
    resumeContext = (chunks ?? []).map((ch: { content: string }) => ch.content).join('\n\n')
  }

  return createSSEResponse(async (stream) => {
    try {
      const openai = createOpenAIClient(c.env.OPENAI_API_KEY)
      const input = [
        ...(profileContext ? [{ role: 'user' as const, content: wrapUserInput('candidate_profile', profileContext) }] : []),
        ...(resumeContext ? [{ role: 'user' as const, content: wrapUserInput('resume', resumeContext) }] : []),
        { role: 'user' as const, content: wrapUserInput('interview_question', question.trim()) },
      ]

      const response = await openai.responses.create({
        model: 'gpt-5.4-nano',
        instructions: ANSWER_GENERATION_SYSTEM_PROMPT,
        input,
        max_output_tokens: ANSWER_MAX_OUTPUT_TOKENS,
        store: false,
        stream: true,
      })

      let totalTokens = 0

      for await (const event of response as AsyncIterable<{ type: string; delta?: string; response?: { usage?: { total_tokens?: number } } }>) {
        if (event.type === 'response.output_text.delta' && event.delta) {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'chunk', content: event.delta }),
          })
        } else if (event.type === 'response.completed') {
          totalTokens = event.response?.usage?.total_tokens ?? 0
        }
      }

      await stream.writeSSE({
        data: JSON.stringify({ type: 'done', data: { tokens: totalTokens } }),
      })

      const adjustPromise = adjustReservedUsage(supabase, userId, 'ai_tokens', ANSWER_RESERVED_TOKENS, totalTokens)
      const recordPromise = recordUsage(supabase, userId, 'ai_completion', totalTokens, 'tokens', { feature: 'answer_generation' })
      if (answerCtx) {
        answerCtx.waitUntil(Promise.all([adjustPromise, recordPromise]))
      } else {
        await Promise.all([adjustPromise, recordPromise])
      }
    } catch (error) {
      const message = mapOpenAIErrorToMessage(error)
      try {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', data: { message } }),
        })
      } catch {
        // ストリームが既にクローズされている場合は無視
      }
      // 予約は必ず解放
      const releasePromise = adjustReservedUsage(supabase, userId, 'ai_tokens', ANSWER_RESERVED_TOKENS, 0)
      if (answerCtx) {
        answerCtx.waitUntil(releasePromise)
      } else {
        await releasePromise
      }
    }
  }, answerCtx)
})

export default app
