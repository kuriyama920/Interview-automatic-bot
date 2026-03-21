import { describe, it, expect, beforeEach } from 'vitest'
import { InterviewSessionState, interviewSession } from '../../src/services/session.service'

describe('InterviewSessionState', () => {
  let session: InterviewSessionState

  beforeEach(() => {
    session = new InterviewSessionState()
  })

  describe('初期状態', () => {
    it('previousResponseId が null', () => {
      expect(session.getPreviousResponseId()).toBeNull()
    })
  })

  describe('setPreviousResponseId', () => {
    it('値を設定できる', () => {
      session.setPreviousResponseId('resp_abc123')
      expect(session.getPreviousResponseId()).toBe('resp_abc123')
    })

    it('値を上書きできる', () => {
      session.setPreviousResponseId('resp_abc123')
      session.setPreviousResponseId('resp_def456')
      expect(session.getPreviousResponseId()).toBe('resp_def456')
    })

    it('ハイフン・アンダースコアを含む有効なIDを受け入れる', () => {
      session.setPreviousResponseId('resp_abc-123_XYZ')
      expect(session.getPreviousResponseId()).toBe('resp_abc-123_XYZ')
    })

    it('resp_ プレフィックスがないIDは無視する', () => {
      session.setPreviousResponseId('invalid_id')
      expect(session.getPreviousResponseId()).toBeNull()
    })

    it('空文字列は無視する', () => {
      session.setPreviousResponseId('')
      expect(session.getPreviousResponseId()).toBeNull()
    })

    it('resp_ のみ（空のサフィックス）は無視する', () => {
      session.setPreviousResponseId('resp_')
      expect(session.getPreviousResponseId()).toBeNull()
    })

    it('スペースを含むIDは無視する', () => {
      session.setPreviousResponseId('resp_ abc123')
      expect(session.getPreviousResponseId()).toBeNull()
    })

    it('不正IDを受け取っても既存の値を保持する', () => {
      session.setPreviousResponseId('resp_valid')
      session.setPreviousResponseId('invalid')
      expect(session.getPreviousResponseId()).toBe('resp_valid')
    })
  })

  describe('startSession', () => {
    it('previousResponseId をリセットする', () => {
      session.setPreviousResponseId('resp_abc123')
      session.startSession()
      expect(session.getPreviousResponseId()).toBeNull()
    })

    it('既に null の場合でもエラーなく動作する', () => {
      session.startSession()
      expect(session.getPreviousResponseId()).toBeNull()
    })
  })

  describe('endSession', () => {
    it('previousResponseId をリセットする', () => {
      session.setPreviousResponseId('resp_abc123')
      session.endSession()
      expect(session.getPreviousResponseId()).toBeNull()
    })

    it('既に null の場合でもエラーなく動作する', () => {
      session.endSession()
      expect(session.getPreviousResponseId()).toBeNull()
    })
  })

  describe('getPreviousResponseIdForModel', () => {
    it('returns responseId when stored model matches targetModel', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-4.1-nano')
      expect(session.getPreviousResponseIdForModel('gpt-4.1-nano')).toBe('resp_abc123')
    })

    it('returns null when stored model does not match targetModel', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-5-nano')
      expect(session.getPreviousResponseIdForModel('gpt-4.1-nano')).toBeNull()
    })

    it('returns responseId when no model was recorded (null model)', () => {
      session.setPreviousResponseId('resp_abc123')
      expect(session.getPreviousResponseIdForModel('gpt-4.1-nano')).toBe('resp_abc123')
    })

    it('returns null when no responseId is stored', () => {
      expect(session.getPreviousResponseIdForModel('gpt-4.1-nano')).toBeNull()
    })

    it('returns null after session is ended', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-4.1-nano')
      session.endSession()
      expect(session.getPreviousResponseIdForModel('gpt-4.1-nano')).toBeNull()
    })

    it('returns null after session is started (reset)', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-4.1-nano')
      session.startSession()
      expect(session.getPreviousResponseIdForModel('gpt-4.1-nano')).toBeNull()
    })
  })

  describe('getPreviousResponseModel', () => {
    it('returns null initially', () => {
      expect(session.getPreviousResponseModel()).toBeNull()
    })

    it('returns the stored model after setPreviousResponseId with model', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-4.1-nano')
      expect(session.getPreviousResponseModel()).toBe('gpt-4.1-nano')
    })

    it('returns null when setPreviousResponseId called without model', () => {
      session.setPreviousResponseId('resp_abc123')
      expect(session.getPreviousResponseModel()).toBeNull()
    })

    it('updates when a new responseId with different model is set', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-5-nano')
      session.setPreviousResponseId('resp_def456', 'gpt-4.1-nano')
      expect(session.getPreviousResponseModel()).toBe('gpt-4.1-nano')
    })

    it('resets to null after endSession', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-4.1-nano')
      session.endSession()
      expect(session.getPreviousResponseModel()).toBeNull()
    })
  })

  describe('setPreviousResponseId with model parameter', () => {
    it('stores both responseId and model', () => {
      session.setPreviousResponseId('resp_abc123', 'gpt-4.1-nano')
      expect(session.getPreviousResponseId()).toBe('resp_abc123')
      expect(session.getPreviousResponseModel()).toBe('gpt-4.1-nano')
    })

    it('stores responseId with null model when model is omitted', () => {
      session.setPreviousResponseId('resp_abc123')
      expect(session.getPreviousResponseId()).toBe('resp_abc123')
      expect(session.getPreviousResponseModel()).toBeNull()
    })

    it('does not update model when responseId format is invalid', () => {
      session.setPreviousResponseId('resp_valid', 'gpt-5-nano')
      session.setPreviousResponseId('invalid_id', 'gpt-4.1-nano')
      expect(session.getPreviousResponseId()).toBe('resp_valid')
      expect(session.getPreviousResponseModel()).toBe('gpt-5-nano')
    })
  })

  describe('シングルトンインスタンス', () => {
    it('interviewSession は InterviewSessionState のインスタンス', () => {
      expect(interviewSession).toBeInstanceOf(InterviewSessionState)
    })
  })

  describe('セッションライフサイクル', () => {
    it('start -> set -> get -> end の完全なフローが動作する', () => {
      session.startSession()
      expect(session.getPreviousResponseId()).toBeNull()

      session.setPreviousResponseId('resp_first')
      expect(session.getPreviousResponseId()).toBe('resp_first')

      session.setPreviousResponseId('resp_second')
      expect(session.getPreviousResponseId()).toBe('resp_second')

      session.endSession()
      expect(session.getPreviousResponseId()).toBeNull()
    })
  })
})
