/**
 * 想定質問 CRUD エンドポイント
 * GET /api/questions - Q&A一覧取得
 * POST /api/questions - Q&Aバッチ保存（同期）
 *
 * @requires JWT認証
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { generateEmbeddings } from '../../lib/openai'

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

/**
 * ユーザーの仮想ドキュメント（expected_qa）を取得または作成
 */
async function getOrCreateVirtualDocument(userId: string): Promise<string> {
  // 既存の仮想ドキュメントを検索
  const { data: existing } = await supabaseAdmin
    .from('documents')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expected_qa')
    .is('deleted_at', null)
    .single()

  if (existing) return existing.id

  // 新規作成
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

/**
 * Q&Aペアのembeddingを生成・保存
 */
async function syncEmbeddings(
  userId: string,
  documentId: string,
  questions: Array<{ id: string; question: string; answer: string }>
): Promise<Map<string, string>> {
  const chunkIdMap = new Map<string, string>()

  // 回答がある質問のみembeddingを生成
  const questionsWithAnswers = questions.filter((q) => q.answer.trim().length > 0)

  if (questionsWithAnswers.length === 0) {
    // 既存のchunksを全削除
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

  // embedding用テキストを生成
  const texts = questionsWithAnswers.map(
    (q) => `質問: ${q.question}\n回答: ${q.answer}`
  )

  const embeddings = await generateEmbeddings(texts)

  // 既存のchunksを全削除して再作成（シンプルな実装）
  await supabaseAdmin
    .from('document_chunks')
    .delete()
    .eq('document_id', documentId)
    .eq('user_id', userId)

  // 新しいchunksを挿入
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

  // chunk_idをマッピング
  if (insertedChunks) {
    for (const chunk of insertedChunks) {
      const question = questionsWithAnswers[chunk.chunk_index]
      if (question) {
        chunkIdMap.set(question.id, chunk.id)
      }
    }
  }

  // ドキュメントのchunk_countを更新
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

  try {
    // 仮想ドキュメントを取得・作成
    const documentId = await getOrCreateVirtualDocument(userId)

    // 既存のQ&A IDを取得（後で安全に削除するため）
    const { data: existingQuestions } = await supabaseAdmin
      .from('interview_questions')
      .select('id')
      .eq('user_id', userId)

    const existingIds = (existingQuestions ?? []).map((q) => q.id)

    if (inputQuestions.length === 0) {
      // 全削除のみ（既存データがある場合のみ）
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

    // 新しいQ&Aを先に挿入（失敗してもデータ消失しない）
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

    // 挿入成功後に旧データを削除（データ消失リスクなし）
    if (existingIds.length > 0) {
      await supabaseAdmin
        .from('interview_questions')
        .delete()
        .in('id', existingIds)
    }

    // Embeddingを同期
    const chunkIdMap = await syncEmbeddings(
      userId,
      documentId,
      (savedQuestions as DbQuestion[]).map((q) => ({
        id: q.id,
        question: q.question,
        answer: q.answer,
      }))
    )

    // chunk_idを並列更新（N+1クエリ解消）
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
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to save questions' })
  }
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

  if (req.method === 'GET') {
    return handleList(req, res, userId)
  } else if (req.method === 'POST') {
    return handleSave(req, res, userId)
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }
}
