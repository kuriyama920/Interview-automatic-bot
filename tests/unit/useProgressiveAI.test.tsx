import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

const mockFindMatch = vi.fn().mockReturnValue(null)
const mockFindPartialMatch = vi.fn().mockReturnValue(null)
const mockRefreshCache = vi.fn().mockResolvedValue(undefined)
const mockClearCache = vi.fn()

vi.mock('../../src/renderer/src/hooks/useQuestionCache', () => ({
  useQuestionCache: () => ({
    findMatch: mockFindMatch,
    findPartialMatch: mockFindPartialMatch,
    refreshCache: mockRefreshCache,
    clearCache: mockClearCache,
  }),
}))

import { useProgressiveAI } from '../../src/renderer/src/hooks/useProgressiveAI'
import type { Transcript } from '../../src/renderer/src/types'

const mockGenerateStreamResponse = vi.fn().mockResolvedValue(undefined)
const mockAbortGeneration = vi.fn()

const defaultOptions = {
  currentText: null as string | null,
  currentSource: undefined as string | undefined,
  audioSource: 'mic',
  transcripts: [] as Transcript[],
  autoGenerateAI: true,
  conversationHistory: '',
  cachedDocumentContextRef: { current: '' } as React.RefObject<string>,
  generateStreamResponse: mockGenerateStreamResponse,
  abortGeneration: mockAbortGeneration,
}

describe('useProgressiveAI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindMatch.mockReturnValue(null)
    mockFindPartialMatch.mockReturnValue(null)
  })

  it('should initialize with null cachedMatch', () => {
    const { result } = renderHook(() => useProgressiveAI(defaultOptions))
    expect(result.current.cachedMatch).toBeNull()
  })

  it('should return refreshQuestionCache and clearQuestionCache functions', () => {
    const { result } = renderHook(() => useProgressiveAI(defaultOptions))
    expect(typeof result.current.refreshQuestionCache).toBe('function')
    expect(typeof result.current.clearQuestionCache).toBe('function')
    expect(typeof result.current.resetProgressiveAI).toBe('function')
  })

  it('should not generate when autoGenerateAI is false', () => {
    renderHook(() =>
      useProgressiveAI({ ...defaultOptions, autoGenerateAI: false, currentText: '面接の質問' })
    )
    expect(mockGenerateStreamResponse).not.toHaveBeenCalled()
  })

  it('should not generate when currentText is null', () => {
    renderHook(() => useProgressiveAI({ ...defaultOptions, currentText: null }))
    expect(mockGenerateStreamResponse).not.toHaveBeenCalled()
  })

  it('should not generate when currentText is too short', () => {
    renderHook(() => useProgressiveAI({ ...defaultOptions, currentText: 'ab' }))
    expect(mockGenerateStreamResponse).not.toHaveBeenCalled()
  })

  it('should trigger AI generation when currentText is long enough', async () => {
    renderHook(() =>
      useProgressiveAI({ ...defaultOptions, currentText: '面接の質問です' })
    )
    await waitFor(() => {
      expect(mockGenerateStreamResponse).toHaveBeenCalled()
    })
  })

  it('should set cachedMatch when question matches', async () => {
    const match = { question: 'テスト質問', answer: 'テスト回答', similarity: 0.95 }
    mockFindMatch.mockReturnValue(match)

    const { result } = renderHook(() =>
      useProgressiveAI({ ...defaultOptions, currentText: 'テスト質問です' })
    )

    await waitFor(() => {
      expect(result.current.cachedMatch).toEqual(match)
    })
    expect(mockAbortGeneration).toHaveBeenCalled()
  })

  it('should call refreshCache on refreshQuestionCache', async () => {
    const { result } = renderHook(() => useProgressiveAI(defaultOptions))

    await act(async () => {
      await result.current.refreshQuestionCache()
    })

    expect(mockRefreshCache).toHaveBeenCalled()
  })

  it('should call clearCache on clearQuestionCache', () => {
    const { result } = renderHook(() => useProgressiveAI(defaultOptions))

    act(() => {
      result.current.clearQuestionCache()
    })

    expect(mockClearCache).toHaveBeenCalled()
  })

  it('should not generate when audioSource is both and currentSource is mic', () => {
    renderHook(() =>
      useProgressiveAI({
        ...defaultOptions,
        audioSource: 'both',
        currentSource: 'mic',
        currentText: '私の発言です',
      })
    )
    expect(mockGenerateStreamResponse).not.toHaveBeenCalled()
  })

  it('should call resetProgressiveAI without error', () => {
    const { result } = renderHook(() => useProgressiveAI(defaultOptions))

    // resetProgressiveAI resets internal refs/timers but not cachedMatch state
    expect(() => {
      act(() => {
        result.current.resetProgressiveAI()
      })
    }).not.toThrow()
  })
})
