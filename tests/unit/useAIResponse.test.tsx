import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useAIResponse } from '../../src/renderer/src/hooks/useAIResponse'

const mockAI = window.electron.ai

describe('useAIResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockAI.generateStreamV2 as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockAI.abort as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(mockAI.onChunk as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.onComplete as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.onError as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.onPhase as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.removeListeners as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAIResponse())
    expect(result.current.response).toBeNull()
    expect(result.current.streamingText).toBe('')
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  it('should set up AI listeners on mount', () => {
    renderHook(() => useAIResponse())
    expect(mockAI.onChunk).toHaveBeenCalled()
    expect(mockAI.onComplete).toHaveBeenCalled()
    expect(mockAI.onError).toHaveBeenCalled()
    expect(mockAI.onPhase).toHaveBeenCalled()
  })

  it('should clean up listeners on unmount', () => {
    const { unmount } = renderHook(() => useAIResponse())
    unmount()
    expect(mockAI.removeListeners).toHaveBeenCalled()
  })

  it('should generate stream response', async () => {
    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponse('ストリーム質問')
    })

    expect(mockAI.generateStream).toHaveBeenCalledWith('ストリーム質問', undefined, undefined)
  })

  it('should not generate stream for empty question', async () => {
    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponse('')
    })

    expect(mockAI.generateStream).not.toHaveBeenCalled()
  })

  it('should set error when stream generation fails', async () => {
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'AI エラー',
    })

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponse('質問')
    })

    expect(result.current.error).toBe('AI エラー')
  })

  it('should abort generation', () => {
    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.abortGeneration()
    })

    expect(mockAI.abort).toHaveBeenCalled()
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.streamingText).toBe('')
    expect(result.current.currentPhase).toBeNull()
  })

  it('should clear response', () => {
    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.clearResponse()
    })

    expect(result.current.response).toBeNull()
    expect(result.current.streamingText).toBe('')
    expect(result.current.error).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  it('should handle stream generation exception', async () => {
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ネットワークエラー'))

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponse('質問')
    })

    expect(result.current.error).toBe('ネットワークエラー')
    expect(result.current.isGenerating).toBe(false)
  })

  it('should set response from successful stream IPC return', async () => {
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      response: { answer: 'ストリーム回答', suggestions: [], confidence: 0.8 },
    })

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponse('質問')
    })

    expect(result.current.response?.answer).toBe('ストリーム回答')
    expect(result.current.isGenerating).toBe(false)
  })

  it('should generate stream response v2', async () => {
    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponseV2('質問', 'コンテキスト', 'committed', { maxTokens: 800 })
    })

    expect(mockAI.generateStreamV2).toHaveBeenCalledWith('質問', 'コンテキスト', 'committed', { maxTokens: 800 })
  })
})

describe('useAIResponse metrics (m10-m12)', () => {
  const mockRecord = vi.fn()
  const mockFinalize = vi.fn()
  const mockMetrics = { record: mockRecord, finalize: mockFinalize }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockAI.abort as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(mockAI.onChunk as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.onComplete as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.onError as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.onPhase as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
    ;(mockAI.removeListeners as ReturnType<typeof vi.fn>).mockReturnValue(undefined)
  })

  /** Get the onChunk handler that the hook registered via useEffect */
  function getChunkHandler(): (chunk: string) => void {
    const calls = (mockAI.onChunk as ReturnType<typeof vi.fn>).mock.calls
    const handler = calls[calls.length - 1]?.[0]
    if (!handler) throw new Error('onChunk handler was not registered')
    return handler
  }

  it('should record m10_chunkReceived on first chunk', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問', undefined, { turnId: 't1' }) })
    act(() => { handler('チャンク') })

    expect(mockRecord).toHaveBeenCalledWith('t1', 'm10_chunkReceived', expect.any(Number))

    await act(async () => { resolveIpc({ success: true }) })
  })

  it('should record m12_uiRendered on every chunk', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問', undefined, { turnId: 't2' }) })
    act(() => { handler('チャンク1') })
    act(() => { handler('チャンク2') })

    const m12Calls = mockRecord.mock.calls.filter((c: unknown[]) => c[1] === 'm12_uiRendered')
    expect(m12Calls.length).toBe(2)

    await act(async () => { resolveIpc({ success: true }) })
  })

  it('should record m10 only once across multiple chunks', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問', undefined, { turnId: 't3' }) })
    act(() => { handler('a') })
    act(() => { handler('b') })
    act(() => { handler('c') })

    const m10Calls = mockRecord.mock.calls.filter((c: unknown[]) => c[1] === 'm10_chunkReceived')
    expect(m10Calls.length).toBe(1)

    await act(async () => { resolveIpc({ success: true }) })
  })

  it('should record m11_stateUpdated after chunk', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問', undefined, { turnId: 't4' }) })
    act(() => { handler('チャンク') })

    expect(mockRecord).toHaveBeenCalledWith('t4', 'm11_stateUpdated', expect.any(Number))

    await act(async () => { resolveIpc({ success: true }) })
  })

  it('should finalize metrics on successful completion', async () => {
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))

    await act(async () => {
      await result.current.generateStreamResponse('質問', undefined, { turnId: 't5' })
    })

    expect(mockFinalize).toHaveBeenCalledWith('t5')
  })

  it('should not finalize metrics on failure', async () => {
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'エラー',
    })

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))

    await act(async () => {
      await result.current.generateStreamResponse('質問', undefined, { turnId: 't6' })
    })

    expect(mockFinalize).not.toHaveBeenCalled()
  })

  it('should not record metrics without turnId', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問') })
    act(() => { handler('チャンク') })

    const metricsCalls = mockRecord.mock.calls.filter(
      (c: unknown[]) => ['m10_chunkReceived', 'm11_stateUpdated', 'm12_uiRendered'].includes(c[1] as string)
    )
    expect(metricsCalls.length).toBe(0)

    await act(async () => { resolveIpc({ success: true }) })
  })

  it('should not record metrics without onMetrics', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse())
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問', undefined, { turnId: 't7' }) })
    act(() => { handler('チャンク') })

    // Should not throw, and streamingText should update
    expect(result.current.streamingText).toBe('チャンク')

    await act(async () => { resolveIpc({ success: true }) })
  })

  it('should record metrics for v2 generation', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStreamV2 as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponseV2('質問', undefined, 'committed', { turnId: 't8' }) })
    act(() => { handler('チャンク') })

    expect(mockRecord).toHaveBeenCalledWith('t8', 'm10_chunkReceived', expect.any(Number))
    expect(mockRecord).toHaveBeenCalledWith('t8', 'm12_uiRendered', expect.any(Number))
    expect(mockRecord).toHaveBeenCalledWith('t8', 'm11_stateUpdated', expect.any(Number))

    await act(async () => { resolveIpc({ success: true }) })
    expect(mockFinalize).toHaveBeenCalledWith('t8')
  })

  it('should reset metrics on abort', async () => {
    let resolveIpc!: (v: { success: boolean }) => void
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((r) => { resolveIpc = r })
    )

    const { result } = renderHook(() => useAIResponse({ onMetrics: mockMetrics }))
    const handler = getChunkHandler()

    act(() => { result.current.generateStreamResponse('質問', undefined, { turnId: 't9' }) })
    act(() => { result.current.abortGeneration() })

    mockRecord.mockClear()
    act(() => { handler('遅延チャンク') })

    const metricsCalls = mockRecord.mock.calls.filter(
      (c: unknown[]) => ['m10_chunkReceived', 'm11_stateUpdated', 'm12_uiRendered'].includes(c[1] as string)
    )
    expect(metricsCalls.length).toBe(0)
  })
})
