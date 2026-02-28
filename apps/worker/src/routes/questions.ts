/**
 * 想定質問ルート
 * GET    /api/questions          - Q&A一覧取得
 * POST   /api/questions          - Q&Aバッチ保存
 * DELETE /api/questions/:id      - 質問削除
 * POST   /api/questions/generate - AI質問生成
 */

import { Hono } from 'hono'
import OpenAI from 'openai'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import { generateEmbeddings } from '../lib/openai'
import { isValidUUID } from '../lib/validation'
import { checkUsageLimit, checkAndReserveUsage, adjustReservedUsage, recordUsage } from '../lib/usage'
import { QUESTION_GENERATION_PROMPT, STANDARD_INTERVIEW_QUESTIONS } from '../lib/prompts'
import { formatProfileContext } from '../lib/profile'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

app.use('*', authRequired)

const MAX_QUESTIONS = 20
const MAX_QUESTION_LENGTH = 500
const MAX_ANSWER_LENGTH = 2000

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

  if (question.chunk_id) {
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

const DEFAULT_COUNT = 20
const MAX_COUNT = 20
const GENERATION_MODEL = 'gpt-5-mini'
const ESTIMATED_TOKENS = 12000

function validateGenerateRequest(body: unknown): { count: number } | { error: string } {
  if (!body || typeof body !== 'object') {
    return { count: DEFAULT_COUNT }
  }

  const data = body as Record<string, unknown>
  let count = DEFAULT_COUNT

  if (data.count !== undefined) {
    if (typeof data.count !== 'number' || !Number.isInteger(data.count)) {
      return { error: 'count must be an integer' }
    }
    if (data.count < 1 || data.count > MAX_COUNT) {
      return { error: `count must be between 1 and ${MAX_COUNT}` }
    }
    count = data.count
  }

  return { count }
}

app.post('/generate', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json()

  const validation = validateGenerateRequest(body)
  if ('error' in validation) {
    return c.json({ success: false, error: validation.error }, 400)
  }

  const { count } = validation

  const [chunksResult, profileResult] = await Promise.all([
    supabase
      .from('document_chunks')
      .select('content, documents!inner (type, name)')
      .eq('user_id', userId)
      .in('documents.type', ['resume', 'job_posting']),
    supabase.from('profiles').select('interview_profile').eq('id', userId).single(),
  ])

  const { data: chunks, error: chunksError } = chunksResult
  const profileContext = formatProfileContext(profileResult.data?.interview_profile)

  if (chunksError) {
    return c.json({ success: false, error: 'Failed to fetch document context' }, 500)
  }

  if (!chunks || chunks.length === 0) {
    return c.json(
      {
        success: false,
        error: '履歴書または求人票をアップロードしてから自動生成してください',
      },
      400
    )
  }

  const resumeChunks: string[] = []
  const jobChunks: string[] = []

  for (const chunk of chunks) {
    const doc = chunk.documents as unknown as { type: string; name: string }
    if (doc.type === 'resume') {
      resumeChunks.push(chunk.content)
    } else if (doc.type === 'job_posting') {
      jobChunks.push(chunk.content)
    }
  }

  let documentContext = ''
  if (profileContext) {
    documentContext += `【候補者プロフィール】\n${profileContext}\n\n`
  }
  if (resumeChunks.length > 0) {
    documentContext += `【履歴書】\n${resumeChunks.join('\n')}\n\n`
  }
  if (jobChunks.length > 0) {
    documentContext += `【求人票】\n${jobChunks.join('\n')}`
  }

  const tokenUsage = await checkAndReserveUsage(supabase, userId, 'ai_tokens', ESTIMATED_TOKENS)
  if (!tokenUsage.allowed) {
    return c.json(
      {
        success: false,
        error: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: tokenUsage.used, limit: tokenUsage.limit, remaining: 0 },
      },
      429
    )
  }

  const selectedQuestions = STANDARD_INTERVIEW_QUESTIONS.slice(0, count)
  const questionsText = selectedQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')

  const openai = new OpenAI({ apiKey: c.env.OPENAI_API_KEY })
  const prompt = QUESTION_GENERATION_PROMPT.replace('{questions}', questionsText).replace(
    '{documentContext}',
    documentContext
  )

  const completion = await openai.chat.completions.create({
    model: GENERATION_MODEL,
    messages: [
      {
        role: 'system',
        content:
          '面接通過率を最大化する戦略的面接コーチとして、候補者の履歴書と求人票を徹底分析し、固定質問リストに対する模範回答のみを生成してください。質問文は絶対に変更・追加せず、回答の配列だけを返してください。',
      },
      { role: 'user', content: prompt },
    ],
    reasoning_effort: 'low' as const,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'interview_answers',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            answers: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['answers'],
          additionalProperties: false,
        },
      },
    },
    max_completion_tokens: 10000,
  })

  const totalTokensUsed = completion.usage?.total_tokens ?? 0

  await adjustReservedUsage(supabase, userId, 'ai_tokens', ESTIMATED_TOKENS, totalTokensUsed)
  if (totalTokensUsed > 0) {
    await recordUsage(
      supabase,
      userId,
      'ai_completion',
      totalTokensUsed,
      'tokens',
      { model: GENERATION_MODEL, type: 'question_generation', count },
      true
    )
  }

  const choice = completion.choices[0]
  if (choice?.finish_reason === 'length') {
    return c.json(
      { success: false, error: 'AI response was truncated. Try reducing the question count.' },
      500
    )
  }

  const message = choice?.message
  if (message?.refusal) {
    return c.json(
      { success: false, error: 'AI declined to generate answers for the provided content' },
      422
    )
  }

  const content = message?.content
  if (!content) {
    return c.json({ success: false, error: 'AI returned empty response' }, 500)
  }

  let parsed: { answers: string[] }
  try {
    parsed = JSON.parse(content) as { answers: string[] }
  } catch {
    return c.json({ success: false, error: 'Failed to parse AI response' }, 500)
  }

  if (!Array.isArray(parsed.answers)) {
    return c.json({ success: false, error: 'Invalid AI response format' }, 500)
  }

  const questions = selectedQuestions.map((q, i) => ({
    question: q,
    answer: typeof parsed.answers[i] === 'string' ? parsed.answers[i].trim() : '',
  }))

  return c.json({
    success: true,
    questions,
    tokensUsed: totalTokensUsed,
  })
})

export default app
