import { describe, it, expect, beforeEach } from 'vitest'
import { InterviewSessionState, interviewSession } from '../../src/services/session.service'

describe('InterviewSessionState', () => {
  let session: InterviewSessionState

  beforeEach(() => {
    session = new InterviewSessionState()
  })

  describe('startSession', () => {
    it('エラーなく動作する', () => {
      expect(() => session.startSession()).not.toThrow()
    })
  })

  describe('endSession', () => {
    it('エラーなく動作する', () => {
      expect(() => session.endSession()).not.toThrow()
    })
  })

  describe('セッションライフサイクル', () => {
    it('start -> end の完全なフローが動作する', () => {
      session.startSession()
      session.endSession()
      // エラーなく完了すればOK
    })
  })

  describe('シングルトンインスタンス', () => {
    it('interviewSession は InterviewSessionState のインスタンス', () => {
      expect(interviewSession).toBeInstanceOf(InterviewSessionState)
    })
  })
})
