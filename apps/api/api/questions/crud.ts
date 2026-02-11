/**
 * 想定質問 CRUD 統合エンドポイント
 * GET /api/questions - Q&A一覧取得
 * POST /api/questions - Q&Aバッチ保存（同期）
 * DELETE /api/questions/:id - 質問削除
 *
 * @requires JWT認証
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { generateEmbeddings } from '../../lib/openai'
import { isValidUUID } from '../../lib/validation'

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

async function getOrCreateVirtualDocument(userId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expected_qa')
    .is('deleted_at', null)
    .single()

  if (existing) return existing.id

  const { data: created, error } = await supabaseAdmin
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
  userId: string,
  documentId: string,
  questions: Array<{ id: string; question: string; answer: string }>
): Promise<Map<string, string>> {
  const chunkIdMap = new Map<string, string>()

  const questionsWithAnswers = questions.filter((q) => q.answer.trim().length > 0)

  if (questionsWithAnswers.length === 0) {
    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId)

    await supabaseAdmin
      .from('documents')
      .update({ chunk_count: 0 })
      .eq('id', documentId)

    return chunkIdMap
  }

  const texts = questionsWithAnswers.map(
    (q) => `質問: ${q.question}\n回答: ${q.answer}`
  )

  const embeddings = await generateEmbeddings(texts)

  await supabaseAdmin
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

  const { data: insertedChunks, error } = await supabaseAdmin
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

  await supabaseAdmin
    .from('documents')
    .update({ chunk_count: questionsWithAnswers.length })
    .eq('id', documentId)

  return chunkIdMap
}

async function handleList(_req: VercelRequest, res: VercelResponse, userId: string) {
  const { data: questions, error } = await supabaseAdmin
    .from('interview_questions')
    .select('id, question, answer, sort_order, is_auto_generated, created_at, updated_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .limit(MAX_QUESTIONS)

  if (error) {
    return res.status(500).json({ success: false, error: 'Failed to fetch questions' })
  }

  return res.status(200).json({
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
}

async function handleSave(req: VercelRequest, res: VercelResponse, userId: string) {
  const validation = validateQuestionsInput(req.body)
  if ('error' in validation) {
    return res.status(400).json({ success: false, error: validation.error })
  }

  const inputQuestions = validation

  const documentId = await getOrCreateVirtualDocument(userId)

  const { data: existingQuestions } = await supabaseAdmin
    .from('interview_questions')
    .select('id')
    .eq('user_id', userId)

  const existingIds = (existingQuestions ?? []).map((q) => q.id)

  if (inputQuestions.length === 0) {
    if (existingIds.length > 0) {
      await supabaseAdmin
        .from('interview_questions')
        .delete()
        .in('id', existingIds)
    }

    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', userId)

    await supabaseAdmin
      .from('documents')
      .update({ chunk_count: 0 })
      .eq('id', documentId)

    return res.status(200).json({ success: true, questions: [] })
  }

  const inserts = inputQuestions.map((q) => ({
    user_id: userId,
    question: q.question,
    answer: q.answer,
    sort_order: q.sortOrder,
    is_auto_generated: false,
  }))

  const { data: savedQuestions, error: insertError } = await supabaseAdmin
    .from('interview_questions')
    .insert(inserts)
    .select('id, question, answer, sort_order, is_auto_generated, created_at, updated_at')

  if (insertError || !savedQuestions) {
    return res.status(500).json({ success: false, error: 'Failed to save questions' })
  }

  if (existingIds.length > 0) {
    await supabaseAdmin
      .from('interview_questions')
      .delete()
      .in('id', existingIds)
  }

  const chunkIdMap = await syncEmbeddings(
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
      supabaseAdmin
        .from('interview_questions')
        .update({ chunk_id: chunkId })
        .eq('id', questionId)
    )
  )

  return res.status(200).json({
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
}

async function handleDeleteQuestion(req: VercelRequest, res: VercelResponse, userId: string) {
  const questionId = req.query.id

  if (!questionId || typeof questionId !== 'string') {
    return res.status(400).json({ success: false, error: 'Question ID is required' })
  }

  if (!isValidUUID(questionId)) {
    return res.status(400).json({ success: false, error: 'Invalid question ID format' })
  }

  const { data: question, error: fetchError } = await supabaseAdmin
    .from('interview_questions')
    .select('id, user_id, chunk_id')
    .eq('id', questionId)
    .single()

  if (fetchError || !question) {
    return res.status(404).json({ success: false, error: 'Question not found' })
  }

  if (question.user_id !== userId) {
    return res.status(403).json({ success: false, error: 'Access denied' })
  }

  if (question.chunk_id) {
    await supabaseAdmin
      .from('document_chunks')
      .delete()
      .eq('id', question.chunk_id)
      .eq('user_id', userId)
  }

  const { error: deleteError } = await supabaseAdmin
    .from('interview_questions')
    .delete()
    .eq('id', questionId)
    .eq('user_id', userId)

  if (deleteError) {
    return res.status(500).json({ success: false, error: 'Failed to delete question' })
  }

  const { data: virtualDoc } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expected_qa')
    .is('deleted_at', null)
    .single()

  if (virtualDoc) {
    const { count } = await supabaseAdmin
      .from('document_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', virtualDoc.id)
      .eq('user_id', userId)

    await supabaseAdmin
      .from('documents')
      .update({ chunk_count: count ?? 0 })
      .eq('id', virtualDoc.id)
  }

  return res.status(200).json({ success: true })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  try {
    if (req.method === 'GET') {
      return handleList(req, res, userId)
    } else if (req.method === 'POST') {
      return handleSave(req, res, userId)
    } else if (req.method === 'DELETE') {
      return handleDeleteQuestion(req, res, userId)
    } else {
      return res.status(405).json({ success: false, error: 'Method not allowed' })
    }
  } catch {
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}
