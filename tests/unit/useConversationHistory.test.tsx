import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useConversationHistory } from '../../src/renderer/src/hooks/useConversationHistory'
import type { Transcript } from '../../src/renderer/src/types'

describe('useConversationHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return empty string with no transcripts', () => {
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts: [], audioSource: 'both' })
    )
    expect(result.current).toBe('')
  })

  it('should return empty string when audioSource is not both', () => {
    const transcripts: Transcript[] = [
      { text: '面接官の質問', source: 'system', timestamp: 1 },
      { text: '私の回答', source: 'mic', timestamp: 2 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'mic' })
    )
    expect(result.current).toBe('')
  })

  it('should return empty string for incomplete turn (only interviewer)', () => {
    const transcripts: Transcript[] = [
      { text: '面接官の質問', source: 'system', timestamp: 1 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toBe('')
  })

  it('should return empty string for incomplete turn (only candidate)', () => {
    const transcripts: Transcript[] = [
      { text: '私の回答', source: 'mic', timestamp: 1 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toBe('')
  })

  it('should build history for a complete turn', () => {
    const transcripts: Transcript[] = [
      { text: '自己紹介してください', source: 'system', timestamp: 1 },
      { text: '田中と申します', source: 'mic', timestamp: 2 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('自己紹介してください')
    expect(result.current).toContain('田中と申します')
  })

  it('should include conversation header in history', () => {
    const transcripts: Transcript[] = [
      { text: '質問', source: 'system', timestamp: 1 },
      { text: '回答', source: 'mic', timestamp: 2 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('これまでの対話')
  })

  it('should handle multiple turns', () => {
    const transcripts: Transcript[] = [
      { text: '質問1', source: 'system', timestamp: 1 },
      { text: '回答1', source: 'mic', timestamp: 2 },
      { text: '質問2', source: 'system', timestamp: 3 },
      { text: '回答2', source: 'mic', timestamp: 4 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('質問1')
    expect(result.current).toContain('回答2')
  })

  it('should skip empty transcripts', () => {
    const transcripts: Transcript[] = [
      { text: '', source: 'system', timestamp: 1 },
      { text: '質問', source: 'system', timestamp: 2 },
      { text: '回答', source: 'mic', timestamp: 3 },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('質問')
    expect(result.current).toContain('回答')
  })
})
