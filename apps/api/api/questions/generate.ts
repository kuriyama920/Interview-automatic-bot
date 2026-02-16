/**
 * 想定質問自動生成エンドポイント
 * POST /api/questions/generate
 *
 * 履歴書+求人票のRAGコンテキストからAIで想定質問を生成
 *
 * @requires JWT認証
 */

import { VercelRequest, VercelResponse } from '@vercel/node'
import OpenAI from 'openai'
import { getUserFromRequest } from '../../lib/auth'
import { supabaseAdmin } from '../../lib/supabase'
import { setCorsHeaders, handlePreflight } from '../../lib/cors'
import { checkAndReserveUsage, adjustReservedUsage, recordUsage, hasCustomApiKey } from '../../lib/usage'
import { getEnv } from '../../lib/env'
import { QUESTION_GENERATION_PROMPT, STANDARD_INTERVIEW_QUESTIONS } from '../../lib/prompts'
import { formatProfileContext } from '../../lib/profile'

export const config = {
  maxDuration: 60,
}

const DEFAULT_COUNT = 20
const MAX_COUNT = 20
const GENERATION_MODEL = 'gpt-5-mini'
const ESTIMATED_TOKENS = 12000

interface GeneratedQuestion {
  question: string
  answer: string
}

function validateRequest(body: unknown): { count: number } | { error: string } {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin

  if (req.method === 'OPTIONS') {
    return handlePreflight(res, origin)
  }

  const isAllowed = setCorsHeaders(res, origin)
  if (!isAllowed && origin) {
    return res.status(403).json({ success: false, error: 'Origin not allowed' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const jwtPayload = getUserFromRequest(req)
  if (!jwtPayload) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const userId = jwtPayload.sub

  const validation = validateRequest(req.body)
  if ('error' in validation) {
    return res.status(400).json({ success: false, error: validation.error })
  }

  const { count } = validation

  try {
    // ドキュメントチャンク + プロフィールを並行取得
    const [chunksResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from('document_chunks')
        .select(`
          content,
          documents!inner (type, name)
        `)
        .eq('user_id', userId)
        .in('documents.type', ['resume', 'job_posting']),
      supabaseAdmin
        .from('profiles')
        .select('interview_profile')
        .eq('id', userId)
        .single(),
    ])

    const { data: chunks, error: chunksError } = chunksResult
    const profileContext = formatProfileContext(profileResult.data?.interview_profile)

    if (chunksError) {
      return res.status(500).json({ success: false, error: 'Failed to fetch document context' })
    }

    if (!chunks || chunks.length === 0) {
      return res.status(400).json({
        success: false,
        error: '履歴書または求人票をアップロードしてから自動生成してください',
      })
    }

    // コンテキストを組み立て
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

    // AI token使用量チェック
    const userHasCustomKey = await hasCustomApiKey(userId, 'openai')

    if (!userHasCustomKey) {
      const usage = await checkAndReserveUsage(userId, 'ai_tokens', ESTIMATED_TOKENS)
      if (!usage.allowed) {
        return res.status(429).json({
          success: false,
          error: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
          usage: {
            used: usage.used,
            limit: usage.limit,
            remaining: 0,
          },
        })
      }
    }

    // 固定質問リストから指定数を取得
    const selectedQuestions = STANDARD_INTERVIEW_QUESTIONS.slice(0, count)
    const questionsText = selectedQuestions
      .map((q, i) => `${i + 1}. ${q}`)
      .join('\n')

    // OpenAI呼び出し
    const openai = new OpenAI({ apiKey: getEnv('OPENAI_API_KEY') })
    const prompt = QUESTION_GENERATION_PROMPT
      .replace('{questions}', questionsText)
      .replace('{documentContext}', documentContext)

    const completion = await openai.chat.completions.create({
      model: GENERATION_MODEL,
      messages: [
        {
          role: 'system',
          content: '面接通過率を最大化する戦略的面接コーチとして、候補者の履歴書と求人票を徹底分析し、固定質問リストに対する模範回答のみを生成してください。質問文は絶対に変更・追加せず、回答の配列だけを返してください。',
        },
        { role: 'user', content: prompt },
      ],
      reasoning_effort: 'low',
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

    // 使用量調整
    if (!userHasCustomKey) {
      await adjustReservedUsage(userId, 'ai_tokens', ESTIMATED_TOKENS, totalTokensUsed)
      if (totalTokensUsed > 0) {
        await recordUsage(userId, 'ai_completion', totalTokensUsed, 'tokens', {
          model: GENERATION_MODEL,
          type: 'question_generation',
          count,
        }, true)
      }
    }

    // レスポンスをパース（回答配列のみ）
    const choice = completion.choices[0]
    if (choice?.finish_reason === 'length') {
      return res.status(500).json({
        success: false,
        error: 'AI response was truncated. Try reducing the question count.',
      })
    }

    const message = choice?.message
    if (message?.refusal) {
      return res.status(422).json({
        success: false,
        error: 'AI declined to generate answers for the provided content',
      })
    }

    const content = message?.content
    if (!content) {
      return res.status(500).json({ success: false, error: 'AI returned empty response' })
    }

    let parsed: { answers: string[] }
    try {
      parsed = JSON.parse(content) as { answers: string[] }
    } catch {
      return res.status(500).json({ success: false, error: 'Failed to parse AI response' })
    }

    if (!Array.isArray(parsed.answers)) {
      return res.status(500).json({ success: false, error: 'Invalid AI response format' })
    }

    // 固定質問と回答をサーバー側で結合
    const questions = selectedQuestions.map((q, i) => ({
      question: q,
      answer: typeof parsed.answers[i] === 'string' ? parsed.answers[i].trim() : '',
    }))

    return res.status(200).json({
      success: true,
      questions,
      tokensUsed: totalTokensUsed,
    })
  } catch (error) {
    console.error('Question generation error:', error)
    return res.status(500).json({ success: false, error: 'Failed to generate questions' })
  }
}
