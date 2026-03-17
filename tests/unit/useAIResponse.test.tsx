import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

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
    ;(mockAI.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      response: { answer: 'テスト回答', suggestions: [], confidence: 0.9 },
    })
    ;(mockAI.generateStream as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
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

  it('should generate response', async () => {
    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateResponse('面接の質問です')
    })

    expect(mockAI.generate).toHaveBeenCalledWith('面接の質問です', undefined, undefined)
    expect(result.current.response?.answer).toBe('テスト回答')
    expect(result.current.isGenerating).toBe(false)
  })

  it('should not generate for empty question', async () => {
    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateResponse('')
    })

    expect(mockAI.generate).not.toHaveBeenCalled()
  })

  it('should set error when generation fails', async () => {
    ;(mockAI.generate as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'AI エラー',
    })

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateResponse('質問')
    })

    expect(result.current.error).toBe('AI エラー')
    expect(result.current.response).toBeNull()
  })

  it('should generate stream response', async () => {
    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponse('ストリーム質問')
    })

    expect(mockAI.generateStream).toHaveBeenCalledWith('ストリーム質問', undefined, undefined)
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

  it('should handle generation exception', async () => {
    ;(mockAI.generate as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ネットワークエラー'))

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateResponse('質問')
    })

    expect(result.current.error).toBe('ネットワークエラー')
    expect(result.current.isGenerating).toBe(false)
  })
})
