import { createLogger } from './logger.service'

const log = createLogger('session-service')

/**
 * 面接セッション状態管理
 * Responses API の previous_response_id をセッション間で保持する
 */
export class InterviewSessionState {
  private previousResponseId: string | null = null
  /** responseId を生成した際のモデル（クロスモデル previous_response_id 防止用） */
  private previousResponseModel: string | null = null

  startSession(): void {
    this.previousResponseId = null
    this.previousResponseModel = null
  }

  getPreviousResponseId(): string | null {
    return this.previousResponseId
  }

  /** 指定モデルと一致する場合のみ previousResponseId を返す（モデルミスマッチ防止） */
  getPreviousResponseIdForModel(targetModel: string): string | null {
    if (this.previousResponseModel && this.previousResponseModel !== targetModel) {
      return null
    }
    return this.previousResponseId
  }

  getPreviousResponseModel(): string | null {
    return this.previousResponseModel
  }

  setPreviousResponseId(id: string, model?: string): void {
    // フォーマット検証: サーバーからの不正なレスポンスIDを拒否
    if (/^resp_[a-zA-Z0-9_-]+$/.test(id)) {
      this.previousResponseId = id
      this.previousResponseModel = model ?? null
    } else {
      log.warn('Ignored invalid previousResponseId format', { id })
    }
  }

  endSession(): void {
    this.previousResponseId = null
    this.previousResponseModel = null
  }
}

export const interviewSession = new InterviewSessionState()
