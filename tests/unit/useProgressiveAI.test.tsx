import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
const mockRefreshCache = vi.fn().mockResolvedValue(undefined)
const mockClearCache = vi.fn()

vi.mock('../../src/renderer/src/hooks/useQuestionCache', () => ({
  useQuestionCache: () => ({
    findMatch: mockFindMatch,
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
    vi.useRealTimers()
    mockFindMatch.mockReturnValue(null)
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('should reset internal state so next text triggers fresh generation', async () => {
    vi.useFakeTimers()

    // First: generate with some text
    const { result, rerender } = renderHook(
      (props) => useProgressiveAI(props),
      { initialProps: { ...defaultOptions, currentText: '最初の質問です' } }
    )

    expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(1)

    // Reset
    act(() => {
      result.current.resetProgressiveAI()
    })

    mockGenerateStreamResponse.mockClear()

    // After reset, same-length text should trigger generation again (not debounced)
    rerender({ ...defaultOptions, currentText: '新しい質問です！' })

    expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })

  describe('interim debounce and re-generation', () => {
    it('should clear cachedMatch when findMatch returns null after previously matching', async () => {
      // First render with a match
      const match = { question: 'テスト質問', answer: 'テスト回答', similarity: 0.95 }
      mockFindMatch.mockReturnValue(match)

      const { result, rerender } = renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, currentText: 'テスト質問です' } }
      )

      await waitFor(() => {
        expect(result.current.cachedMatch).toEqual(match)
      })

      // Now clear the match
      mockFindMatch.mockReturnValue(null)
      rerender({ ...defaultOptions, currentText: 'まったく違う質問を聞いています' })

      await waitFor(() => {
        expect(result.current.cachedMatch).toBeNull()
      })
    })

    it('should trigger debounced re-generation when text grows 2.0x (100%+)', async () => {
      vi.useFakeTimers()

      // Initial text: 4 chars
      const { rerender } = renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, currentText: '質問です' } }
      )

      // First generation triggers immediately
      expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(1)

      // Text grows more than 2.0x (4 chars -> 9+ chars needed) -> should debounce
      rerender({ ...defaultOptions, currentText: '質問です。もっと長いテキストになりました。さらに長く。' })

      // Not yet called (debounce pending)
      expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(1)

      // Advance past debounce time
      await act(async () => {
        vi.advanceTimersByTime(350)
      })

      expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('should NOT trigger re-generation when text grows only 1.5x (below 2.0x threshold)', async () => {
      vi.useFakeTimers()

      // Initial text: 10 chars
      const initialText = 'これは質問テスト用'  // 9 chars
      const { rerender } = renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, currentText: initialText } }
      )

      // First generation triggers immediately
      expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(1)

      // Text grows 1.5x (9 chars * 1.5 = 13.5, so 14 chars should NOT trigger with 2.0x threshold)
      // 9 * 2.0 = 18, so 14 chars < 18 -> should NOT re-generate
      const grownText = 'これは質問テスト用。少し長くなった'  // 16 chars
      rerender({ ...defaultOptions, currentText: grownText })

      // Advance past debounce time
      await act(async () => {
        vi.advanceTimersByTime(350)
      })

      // Should still be 1 (no re-generation because text didn't double)
      expect(mockGenerateStreamResponse).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('final transcript processing', () => {
    it('should process final transcripts after 200ms debounce (FINAL_ACCUMULATE_MS)', async () => {
      vi.useFakeTimers()

      const transcripts: Transcript[] = [
        { text: '面接官の質問です', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, transcripts, audioSource: 'mic' } }
      )

      // At 150ms, should NOT have processed yet
      await act(async () => {
        vi.advanceTimersByTime(150)
      })
      expect(mockGenerateStreamResponse).not.toHaveBeenCalled()

      // At 200ms total (advance 50 more), should have processed
      await act(async () => {
        vi.advanceTimersByTime(50)
      })
      expect(mockGenerateStreamResponse).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should filter mic transcripts when audioSource is both', async () => {
      vi.useFakeTimers()

      const transcripts: Transcript[] = [
        { text: '自分の発言', source: 'mic', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, transcripts, audioSource: 'both' } }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // mic only → no interviewer transcripts → should not trigger generation for final
      expect(mockGenerateStreamResponse).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should process accumulated finals when candidate transcript arrives after interviewer in both mode', async () => {
      vi.useFakeTimers()

      // First: interviewer transcript arrives → starts accumulate timer
      const transcripts1: Transcript[] = [
        { text: '面接官の質問です', source: 'system', timestamp: 1 },
      ]

      const { rerender } = renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, transcripts: transcripts1, audioSource: 'both' } }
      )

      // Advance past final accumulate time to process the interviewer transcript
      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Should have triggered generation for the interviewer transcript
      expect(mockGenerateStreamResponse).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should set cachedMatch on final transcript match', async () => {
      vi.useFakeTimers()

      const match = { question: '自己紹介をお願いします', answer: '田中です', similarity: 0.92 }
      mockFindMatch.mockReturnValue(match)

      const transcripts: Transcript[] = [
        { text: '自己紹介をお願いします', source: 'system', timestamp: 1 },
      ]

      const { result } = renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, transcripts, audioSource: 'mic' } }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      expect(result.current.cachedMatch).toEqual(match)
      expect(mockAbortGeneration).toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should skip final processing when text is too short', async () => {
      vi.useFakeTimers()

      const transcripts: Transcript[] = [
        { text: 'あ', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, transcripts, audioSource: 'mic' } }
      )

      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      // Too short text → should not trigger generation
      expect(mockGenerateStreamResponse).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should pass turnId in options when triggering final AI generation', async () => {
      vi.useFakeTimers()

      // Mock crypto.randomUUID via vi.spyOn
      const mockUUID = 'test-turn-id-1234-5678'
      const randomUUIDSpy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(mockUUID as `${string}-${string}-${string}-${string}-${string}`)

      mockFindMatch.mockReturnValue(null)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        { initialProps: { ...defaultOptions, transcripts, audioSource: 'mic' } }
      )

      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      // Should pass turnId in options
      const lastCall = mockGenerateStreamResponse.mock.calls[
        mockGenerateStreamResponse.mock.calls.length - 1
      ]
      expect(lastCall[2]).toEqual(
        expect.objectContaining({ turnId: mockUUID })
      )

      randomUUIDSpy.mockRestore()
      vi.useRealTimers()
    })
  })

  describe('v2 Speculative/Committed Lane', () => {
    const mockGenerateStreamV2 = vi.fn().mockResolvedValue(undefined)

    beforeEach(() => {
      mockGenerateStreamV2.mockClear()
    })

    it('generateStreamResponseV2 が渡されれば Interim で speculative phase を呼ぶ', async () => {
      renderHook(() =>
        useProgressiveAI({
          ...defaultOptions,
          currentText: '面接官の質問です',
          generateStreamResponseV2: mockGenerateStreamV2,
        })
      )

      await waitFor(() => {
        expect(mockGenerateStreamV2).toHaveBeenCalled()
      })

      const [, , phase] = mockGenerateStreamV2.mock.calls[0]
      expect(phase).toBe('speculative')
    })

    it('generateStreamResponseV2 がない場合は v1 にフォールバックする（Interim）', async () => {
      renderHook(() =>
        useProgressiveAI({
          ...defaultOptions,
          currentText: '面接官の質問です',
          // generateStreamResponseV2 は渡さない
        })
      )

      await waitFor(() => {
        expect(mockGenerateStreamResponse).toHaveBeenCalled()
      })

      expect(mockGenerateStreamV2).not.toHaveBeenCalled()
    })

    it('generateStreamResponseV2 が渡されれば Final で committed phase を呼ぶ', async () => {
      vi.useFakeTimers()

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            generateStreamResponseV2: mockGenerateStreamV2,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Final処理で committed phase が呼ばれること
      const committedCalls = mockGenerateStreamV2.mock.calls.filter(
        ([, , phase]) => phase === 'committed'
      )
      expect(committedCalls.length).toBeGreaterThanOrEqual(1)

      vi.useRealTimers()
    })

    it('should pass includeDocumentContext to v2 committed call', async () => {
      vi.useFakeTimers()
      mockFindMatch.mockReturnValue(null)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: { current: '' } as React.RefObject<string>,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      const committedCall = mockGenerateStreamV2.mock.calls.find(
        ([, , phase]) => phase === 'committed'
      )
      expect(committedCall).toBeDefined()
      expect(committedCall![3]).toEqual(
        expect.objectContaining({ includeDocumentContext: true })
      )

      vi.useRealTimers()
    })

    it('should pass includeDocumentContext false when cached docs exist in v2 committed call', async () => {
      vi.useFakeTimers()
      mockFindMatch.mockReturnValue(null)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: { current: '' } as React.RefObject<string>,
            cachedDocumentContextRef: { current: 'cached-docs' } as React.RefObject<string>,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      const committedCall = mockGenerateStreamV2.mock.calls.find(
        ([, , phase]) => phase === 'committed'
      )
      expect(committedCall).toBeDefined()
      expect(committedCall![3]).toEqual(
        expect.objectContaining({ includeDocumentContext: false })
      )

      vi.useRealTimers()
    })

    it('committed phase 呼び出しに speculativeText が含まれる（speculativeTextRefある場合）', async () => {
      vi.useFakeTimers()

      const speculativeTextRef = { current: '投機的に生成された回答テキスト' }
      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: speculativeTextRef as React.RefObject<string>,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      const committedCall = mockGenerateStreamV2.mock.calls.find(
        ([, , phase]) => phase === 'committed'
      )
      expect(committedCall).toBeDefined()
      expect(committedCall![3]).toEqual(
        expect.objectContaining({ speculativeText: '投機的に生成された回答テキスト' })
      )

      vi.useRealTimers()
    })
  })

  describe('speculative adoption (D-1/D-2)', () => {
    const mockGenerateStreamV2 = vi.fn().mockResolvedValue(undefined)

    beforeEach(() => {
      mockGenerateStreamV2.mockClear()
    })

    it('should record adoption metrics when committed generation completes with v2 and speculativeTextRef', async () => {
      vi.useFakeTimers()
      const mockRecord = vi.fn()
      const mockFinalize = vi.fn()

      // speculativeTextRef has content from speculative generation
      const speculativeTextRef = { current: 'これは面接の回答です。私の経験として、前職でプロジェクトマネージャーとして多くのプロジェクトを成功に導きました。特にチームビルディングに注力しました。品質管理も重要視しています。' }

      // Mock v2 to resolve with committed text (similar to speculative)
      mockGenerateStreamV2.mockResolvedValue(undefined)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: speculativeTextRef as React.RefObject<string>,
            onMetrics: { record: mockRecord, finalize: mockFinalize },
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Should have recorded adoption metrics
      const adoptedCalls = mockRecord.mock.calls.filter(
        ([, point]) => point === 'speculative_adopted' || point === 'speculative_changeRate' || point === 'speculative_reason'
      )
      expect(adoptedCalls.length).toBeGreaterThanOrEqual(3)

      vi.useRealTimers()
    })

    it('should not record adoption metrics when speculativeTextRef is empty', async () => {
      vi.useFakeTimers()
      const mockRecord = vi.fn()
      const mockFinalize = vi.fn()

      const speculativeTextRef = { current: '' }

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: speculativeTextRef as React.RefObject<string>,
            onMetrics: { record: mockRecord, finalize: mockFinalize },
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Should NOT have recorded speculative_adopted
      const adoptedCalls = mockRecord.mock.calls.filter(
        ([, point]) => point === 'speculative_adopted'
      )
      expect(adoptedCalls.length).toBe(0)

      vi.useRealTimers()
    })

    it('should not record adoption metrics without v2 (v1 path)', async () => {
      vi.useFakeTimers()
      const mockRecord = vi.fn()
      const mockFinalize = vi.fn()

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            onMetrics: { record: mockRecord, finalize: mockFinalize },
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      const adoptedCalls = mockRecord.mock.calls.filter(
        ([, point]) => point === 'speculative_adopted'
      )
      expect(adoptedCalls.length).toBe(0)

      vi.useRealTimers()
    })
  })

  describe('onMetrics callback', () => {
    it('should call onMetrics.record when processing final transcripts', async () => {
      vi.useFakeTimers()
      const mockRecord = vi.fn()
      const mockFinalize = vi.fn()

      mockFindMatch.mockReturnValue(null)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            onMetrics: { record: mockRecord, finalize: mockFinalize },
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      expect(mockRecord).toHaveBeenCalledWith(
        expect.any(String),
        'm2_triggered',
        expect.any(Number)
      )

      vi.useRealTimers()
    })

    it('should not call onMetrics.finalize (finalize is handled by useAIResponse)', async () => {
      vi.useFakeTimers()
      const mockRecord = vi.fn()
      const mockFinalize = vi.fn()

      mockFindMatch.mockReturnValue(null)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            onMetrics: { record: mockRecord, finalize: mockFinalize },
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // finalize is now called in useAIResponse after m10-m12 metrics are recorded,
      // not in useProgressiveAI (which only calls record for m2/m3)
      expect(mockFinalize).not.toHaveBeenCalled()

      vi.useRealTimers()
    })

    it('should not fail when onMetrics is not provided', async () => {
      vi.useFakeTimers()
      mockFindMatch.mockReturnValue(null)

      const transcripts: Transcript[] = [
        { text: '面接官の質問テキスト', source: 'system', timestamp: 1 },
      ]

      // No onMetrics provided - should not throw
      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      expect(mockGenerateStreamResponse).toHaveBeenCalled()

      vi.useRealTimers()
    })
  })

  describe('pendingCommittedTurnIdRef', () => {
    const mockGenerateStreamV2 = vi.fn().mockResolvedValue(undefined)

    beforeEach(() => {
      mockGenerateStreamV2.mockClear()
    })

    it('should expose pendingCommittedTurnIdRef and set it when committed generation starts', async () => {
      vi.useFakeTimers()
      const speculativeTextRef = { current: 'speculative text for testing purposes only' }

      const transcripts: Transcript[] = [
        { text: 'テスト質問', source: 'system', timestamp: 1 },
      ]

      const { result } = renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic' as const,
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: speculativeTextRef as React.RefObject<string>,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // pendingCommittedTurnIdRef should be set (non-null UUID)
      expect(result.current.pendingCommittedTurnIdRef.current).toMatch(/^[a-f0-9-]+$/)

      vi.useRealTimers()
    })

    it('should clear pendingCommittedTurnIdRef on reset', async () => {
      vi.useFakeTimers()
      const speculativeTextRef = { current: 'speculative text' }

      const transcripts: Transcript[] = [
        { text: 'テスト質問', source: 'system', timestamp: 1 },
      ]

      const { result } = renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic' as const,
            generateStreamResponseV2: mockGenerateStreamV2,
            speculativeTextRef: speculativeTextRef as React.RefObject<string>,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Reset should clear it
      act(() => {
        result.current.resetProgressiveAI()
      })

      expect(result.current.pendingCommittedTurnIdRef.current).toBeNull()

      vi.useRealTimers()
    })
  })

  describe('context building', () => {
    it('should pass document context and conversation history', async () => {
      renderHook(() =>
        useProgressiveAI({
          ...defaultOptions,
          currentText: '面接の質問です',
          conversationHistory: '前の対話',
          cachedDocumentContextRef: { current: 'ドキュメント' } as React.RefObject<string>,
        })
      )

      await waitFor(() => {
        expect(mockGenerateStreamResponse).toHaveBeenCalled()
      })

      const contextArg = mockGenerateStreamResponse.mock.calls[0][1]
      expect(contextArg).toContain('ドキュメント')
      expect(contextArg).toContain('前の対話')
    })

    it('should set includeDocumentContext false when cached docs exist in final', async () => {
      vi.useFakeTimers()

      const transcripts: Transcript[] = [
        { text: '質問テキスト長め', source: 'system', timestamp: 1 },
      ]

      renderHook(
        (props) => useProgressiveAI(props),
        {
          initialProps: {
            ...defaultOptions,
            transcripts,
            audioSource: 'mic',
            cachedDocumentContextRef: { current: 'cached-docs' } as React.RefObject<string>,
          },
        }
      )

      await act(async () => {
        vi.advanceTimersByTime(250)
      })

      const lastCall = mockGenerateStreamResponse.mock.calls[
        mockGenerateStreamResponse.mock.calls.length - 1
      ]
      expect(lastCall[2]?.includeDocumentContext).toBe(false)

      vi.useRealTimers()
    })
  })
})
