import { createLogger } from './logger.service'

const log = createLogger('session-service')

/**
 * 面接セッション状態管理
 * STTのライフサイクルに合わせてセッション開始/終了を管理する。
 * 将来的にセッション固有の状態（要約キャッシュ等）を追加するための基盤。
 */
export class InterviewSessionState {
  startSession(): void {
    log.info('Session started')
  }

  endSession(): void {
    log.info('Session ended')
  }
}

export const interviewSession = new InterviewSessionState()
