/**
 * 想定質問サービス
 *
 * Supabase APIを通じてQ&Aペアを管理。
 * contextServiceと同じパターンでauthService.authenticatedFetchを使用。
 */

import { createLogger } from './logger.service'
import { authService } from './auth.service'
import { getConfig } from '../config/env-config'
import type { InterviewQuestion, QuestionInput } from '../types/question'

const log = createLogger('questions-service')

const { apiBaseUrl: API_BASE_URL } = getConfig()

interface ApiQuestionsResponse {
  success: boolean
  questions?: InterviewQuestion[]
  error?: string
}

class QuestionsService {
  /**
   * Q&A一覧を取得
   */
  async getQuestions(): Promise<InterviewQuestion[]> {
    log.debug('Fetching interview questions from API')

    try {
      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/api/questions`,
        { method: 'GET' }
      )

      if (!response.ok) {
        if (response.status === 401) {
          log.warn('Fetch questions failed: unauthorized')
          return []
        }
        throw new Error(`Failed to fetch questions: ${response.status}`)
      }

      const data = (await response.json()) as ApiQuestionsResponse

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch questions')
      }

      log.debug('Questions fetched', { count: data.questions?.length ?? 0 })
      return data.questions ?? []
    } catch (error) {
      log.error('Failed to fetch questions', { error: String(error) })
      return []
    }
  }

  /**
   * Q&Aをバッチ保存（全件同期）
   */
  async saveQuestions(questions: QuestionInput[]): Promise<InterviewQuestion[]> {
    log.info('Saving interview questions', { count: questions.length })

    const response = await authService.authenticatedFetch(
      `${API_BASE_URL}/api/questions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      }
    )

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      const errorMessage = errorData.error || `Save failed: ${response.status}`
      log.error('Questions save failed', { error: errorMessage })
      throw new Error(errorMessage)
    }

    const data = (await response.json()) as ApiQuestionsResponse

    if (!data.success) {
      throw new Error(data.error || 'Failed to save questions')
    }

    log.info('Questions saved successfully', { count: data.questions?.length ?? 0 })
    return data.questions ?? []
  }

  /**
   * 個別Q&Aを削除
   */
  async deleteQuestion(questionId: string): Promise<void> {
    log.info('Deleting interview question', { id: questionId })

    const response = await authService.authenticatedFetch(
      `${API_BASE_URL}/api/questions/${questionId}`,
      { method: 'DELETE' }
    )

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string }
      const errorMessage = errorData.error || `Delete failed: ${response.status}`
      log.error('Question delete failed', { error: errorMessage })
      throw new Error(errorMessage)
    }

    log.info('Question deleted successfully', { id: questionId })
  }
}

export const questionsService = new QuestionsService()
