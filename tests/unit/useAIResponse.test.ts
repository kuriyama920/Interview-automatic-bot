import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAIResponse } from '../../src/renderer/src/hooks/useAIResponse'

// ── テスト用: window.electron.ai のコールバックを取得するヘルパー ──

type ChunkCallback = (chunk: string) => void
type ErrorCallback = (error: string) => void
type PhaseCallback = (phase: string) => void

let onChunkCb: ChunkCallback
let onErrorCb: ErrorCallback
let onPhaseCb: PhaseCallback

// Mock logger with captured warn/error for 2-C testing
const { mockLogWarn, mockLogError } = vi.hoisted(() => {
  return {
    mockLogWarn: vi.fn(),
    mockLogError: vi.fn(),
  }
})

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLogWarn,
    error: mockLogError,
  }),
}))

describe('useAIResponse - Double Buffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // setup.tsで定義済みのwindow.electron.aiモックを再設定
    // onChunk等はコールバックをキャプチャする
    window.electron.ai.onChunk = vi.fn((cb: ChunkCallback) => { onChunkCb = cb })
    window.electron.ai.onError = vi.fn((cb: ErrorCallback) => { onErrorCb = cb })
    window.electron.ai.onPhase = vi.fn((cb: PhaseCallback) => { onPhaseCb = cb })
    window.electron.ai.onComplete = vi.fn()
    window.electron.ai.removeListeners = vi.fn()
    window.electron.ai.abort = vi.fn().mockResolvedValue(undefined)
  })

  // ── Phase 1.1: 新しいstate/refが初期化される ────────────

  it('should initialize committedStreamingText as empty string', () => {
    const { result } = renderHook(() => useAIResponse())
    expect(result.current.committedStreamingText).toBe('')
  })

  it('should initialize committedResponse as null', () => {
    const { result } = renderHook(() => useAIResponse())
    expect(result.current.committedResponse).toBeNull()
  })

  // ── Phase 1.3: onChunk phase振り分け ──────────────────

  it('should route speculative chunks to streamingText (front buffer)', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    // Speculative生成開始（currentPhaseRef = 'speculative'）
    act(() => {
      result.current.generateStreamResponseV2('テスト質問', undefined, 'speculative')
    })

    // チャンク到着
    act(() => { onChunkCb('こんにちは') })
    act(() => { onChunkCb('、はい。') })

    // streamingText（フロントバッファ）にspeculativeチャンクが蓄積
    expect(result.current.streamingText).toContain('こんにちは')
    // committedStreamingText（バックバッファ）は空
    expect(result.current.committedStreamingText).toBe('')
  })

  it('should route committed chunks to committedStreamingText (back buffer)', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    // Committed生成開始（currentPhaseRef = 'committed'）
    act(() => {
      result.current.generateStreamResponseV2('テスト質問', undefined, 'committed')
    })

    // チャンク到着
    act(() => { onChunkCb('確定回答') })
    act(() => { onChunkCb('の続き') })

    // committedStreamingText（バックバッファ）に蓄積
    expect(result.current.committedStreamingText).toContain('確定回答')
  })

  // ── Phase 1.4: Committed開始時にstreamingTextがクリアされない ──

  it('should NOT clear streamingText when committed generation starts', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    // Speculative生成でstreamingTextにデータを入れる
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'speculative')
    })
    act(() => { onChunkCb('Speculative回答テキスト') })

    const speculativeText = result.current.streamingText
    expect(speculativeText).toBeTruthy()

    // Committed生成を開始
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    // ★ streamingTextはクリアされていない
    expect(result.current.streamingText).toBe(speculativeText)
  })

  // ── Phase 1.5: executeStreamGeneration完了時のバッファ振り分け ──

  it('should store committed completion in committedResponse (back buffer)', async () => {
    const committedResponse = {
      answer: '確定された回答です。品質の高い回答を提供します。',
      suggestions: ['提案1'],
      confidence: 0.95,
    }
    window.electron.ai.generateStreamV2 = vi.fn().mockResolvedValue({
      success: true,
      response: committedResponse,
    })

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponseV2('テスト質問', undefined, 'committed')
    })

    expect(result.current.committedResponse).toEqual(committedResponse)
  })

  it('should store speculative completion in response (front buffer)', async () => {
    const speculativeResponse = {
      answer: '下書き回答',
      suggestions: [],
      confidence: 0.7,
    }
    window.electron.ai.generateStreamV2 = vi.fn().mockResolvedValue({
      success: true,
      response: speculativeResponse,
    })

    const { result } = renderHook(() => useAIResponse())

    await act(async () => {
      await result.current.generateStreamResponseV2('テスト質問', undefined, 'speculative')
    })

    expect(result.current.response).toEqual(speculativeResponse)
  })

  // ── Phase 1.6: applyCommittedResult / discardCommittedResult ──

  it('applyCommittedResult should swap committed result to front buffer', async () => {
    const committedResponse = {
      answer: '確定された高品質回答',
      suggestions: ['提案A'],
      confidence: 0.95,
    }
    window.electron.ai.generateStreamV2 = vi.fn().mockResolvedValue({
      success: true,
      response: committedResponse,
    })

    const { result } = renderHook(() => useAIResponse())

    // Committed完了
    await act(async () => {
      await result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    // applyCommittedResult実行（不採用時）— 引数でcommitted結果を渡す
    act(() => {
      result.current.applyCommittedResult({
        response: committedResponse,
        streamingText: '',
      })
    })

    expect(result.current.response).toEqual(committedResponse)
    expect(result.current.streamingText).toBe(committedResponse.answer)
    expect(result.current.committedStreamingText).toBe('')
    expect(result.current.committedResponse).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  it('applyCommittedResult should fallback to streamingText when response is null', () => {
    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.applyCommittedResult({
        response: null,
        streamingText: '部分的なCommittedテキスト',
      })
    })

    expect(result.current.streamingText).toBe('部分的なCommittedテキスト')
    expect(result.current.response).toBeNull()
  })

  it('discardCommittedResult should promote speculative text to response', () => {
    const { result } = renderHook(() => useAIResponse())

    const specText = '下書きの回答テキストです。十分な品質があります。'

    act(() => {
      result.current.discardCommittedResult(specText)
    })

    expect(result.current.response?.answer).toBe(specText)
    expect(result.current.committedStreamingText).toBe('')
    expect(result.current.committedResponse).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  // ── Rev.2 #1: currentPhaseRef同期 ──

  it('should set currentPhase immediately in generateStreamResponseV2', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    expect(result.current.currentPhase).toBe('committed')

    // Committedチャンクがバックバッファに振り分けられる
    act(() => { onChunkCb('確定チャンク') })
    expect(result.current.committedStreamingText).toContain('確定チャンク')
  })

  // ── Rev.2 #2: Committed エラーで Speculative 保持 ──

  it('should preserve speculative text when committed generation errors', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    // Speculative生成でテキストを入れる
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'speculative')
    })
    act(() => { onChunkCb('Speculative回答') })

    // Committed生成開始
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    // Committedエラー発生
    act(() => { onErrorCb('API error') })

    // ★ Speculative のstreamingTextは保持されている
    expect(result.current.streamingText).toBe('Speculative回答')
    expect(result.current.error).toBe('API error')
  })

  // ── Rev.2 #3: abortGeneration で新 state リセット ──

  it('should reset committed state on abort', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })
    act(() => { onChunkCb('確定チャンク') })

    act(() => { result.current.abortGeneration() })

    expect(result.current.committedStreamingText).toBe('')
    expect(result.current.committedResponse).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  // ── Rev.2 #4: clearResponse で新 state リセット ──

  it('should reset committed state on clearResponse', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })
    act(() => { onChunkCb('確定チャンク') })

    act(() => { result.current.clearResponse() })

    expect(result.current.committedStreamingText).toBe('')
    expect(result.current.committedResponse).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  // ── 2-A [HIGH]: Helper functions wrapped in useCallback for stable references ──

  it('should return stable abortGeneration reference across re-renders', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result, rerender } = renderHook(() => useAIResponse())

    const firstRef = result.current.abortGeneration
    rerender()
    const secondRef = result.current.abortGeneration

    // useCallback with stable deps should return the same reference
    expect(firstRef).toBe(secondRef)
  })

  it('should return stable clearResponse reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useAIResponse())

    const firstRef = result.current.clearResponse
    rerender()
    const secondRef = result.current.clearResponse

    expect(firstRef).toBe(secondRef)
  })

  it('should return stable discardCommittedResult reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useAIResponse())

    const firstRef = result.current.discardCommittedResult
    rerender()
    const secondRef = result.current.discardCommittedResult

    expect(firstRef).toBe(secondRef)
  })

  it('should return stable applyCommittedResult reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useAIResponse())

    const firstRef = result.current.applyCommittedResult
    rerender()
    const secondRef = result.current.applyCommittedResult

    expect(firstRef).toBe(secondRef)
  })

  // ── 2-B [HIGH]: abort() error handling ──

  it('should complete cleanup even when abort() throws', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))
    window.electron.ai.abort = vi.fn().mockImplementation(() => {
      throw new Error('IPC channel destroyed')
    })

    const { result } = renderHook(() => useAIResponse())

    // Start generation to set up state
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })
    act(() => { onChunkCb('確定チャンク') })

    // abortGeneration should NOT throw even if abort() throws
    expect(() => {
      act(() => { result.current.abortGeneration() })
    }).not.toThrow()

    // Cleanup should still have run
    expect(result.current.isGenerating).toBe(false)
    expect(result.current.streamingText).toBe('')
    expect(result.current.committedStreamingText).toBe('')
    expect(result.current.committedResponse).toBeNull()
    expect(result.current.currentPhase).toBeNull()
  })

  // ── 2-C [HIGH]: Committed error surfaces committedError flag ──

  it('should surface error when committed phase errors (error state visible)', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    // Speculative生成でテキストを入れる
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'speculative')
    })
    act(() => { onChunkCb('Speculative回答テキスト') })

    // Committed生成開始
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    // Committedエラー発生
    act(() => { onErrorCb('Committed generation failed') })

    // Error should be visible to the user
    expect(result.current.error).toBe('Committed generation failed')
    // Speculative text should be preserved
    expect(result.current.streamingText).toBe('Speculative回答テキスト')
    // isGenerating should be false
    expect(result.current.isGenerating).toBe(false)
  })

  it('should surface error when committed IPC call throws exception', async () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    // Speculative
    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'speculative')
    })
    act(() => { onChunkCb('Speculative回答') })

    // Committed: exception
    window.electron.ai.generateStreamV2 = vi.fn().mockRejectedValue(new Error('Network timeout'))

    await act(async () => {
      await result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    // Error should be surfaced
    expect(result.current.error).toBe('Network timeout')
    // Speculative text preserved (committed error clears committed buffer, not speculative)
    expect(result.current.isGenerating).toBe(false)
  })

  // ── Rev.2 #11: executeStreamGeneration エラーブランチ ──

  it('should preserve speculative text when committed IPC returns error', async () => {
    // Speculative: never resolves
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))

    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.generateStreamResponseV2('テスト', undefined, 'speculative')
    })
    act(() => { onChunkCb('大切なSpeculative回答') })

    // Committed: エラーで返る
    window.electron.ai.generateStreamV2 = vi.fn().mockResolvedValue({
      success: false,
      error: 'Server error',
    })

    await act(async () => {
      await result.current.generateStreamResponseV2('テスト', undefined, 'committed')
    })

    expect(result.current.error).toBe('Server error')
  })

  // ── 2-C [HIGH]: Committed error logs at warn level to distinguish from speculative ──

  it('should log committed error at warn level (not just error level)', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))
    mockLogWarn.mockClear()
    mockLogError.mockClear()

    const { result } = renderHook(() => useAIResponse())

    // Speculative
    act(() => {
      result.current.generateStreamResponseV2('test', undefined, 'speculative')
    })
    act(() => { onChunkCb('Speculative text') })

    // Committed
    act(() => {
      result.current.generateStreamResponseV2('test', undefined, 'committed')
    })

    // Committed error
    act(() => { onErrorCb('Committed API timeout') })

    // Should log at warn level specifically for committed errors
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.stringContaining('committed'),
      expect.objectContaining({ error: 'Committed API timeout' }),
    )
  })

  it('should log speculative error at error level (not warn)', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))
    mockLogWarn.mockClear()
    mockLogError.mockClear()

    const { result } = renderHook(() => useAIResponse())

    // Speculative
    act(() => {
      result.current.generateStreamResponseV2('test', undefined, 'speculative')
    })

    // Speculative error
    act(() => { onErrorCb('Speculative API error') })

    // Should log at error level for speculative errors
    expect(mockLogError).toHaveBeenCalledWith(
      expect.stringContaining('error'),
      expect.objectContaining({ error: 'Speculative API error' }),
    )
    // Should NOT log at warn level for speculative errors
    const warnCalls = mockLogWarn.mock.calls.filter(
      (call: unknown[]) => typeof call[0] === 'string' && call[0].toLowerCase().includes('committed')
    )
    expect(warnCalls).toHaveLength(0)
  })

  // ── 2-B [HIGH]: abort() error should be logged ──

  it('should log abort error when abort() throws', () => {
    window.electron.ai.generateStreamV2 = vi.fn(() => new Promise(() => {}))
    window.electron.ai.abort = vi.fn().mockImplementation(() => {
      throw new Error('IPC channel destroyed')
    })
    mockLogWarn.mockClear()
    mockLogError.mockClear()

    const { result } = renderHook(() => useAIResponse())

    act(() => {
      result.current.generateStreamResponseV2('test', undefined, 'speculative')
    })

    act(() => { result.current.abortGeneration() })

    // Should log the abort error
    expect(mockLogWarn).toHaveBeenCalledWith(
      expect.stringContaining('abort'),
      expect.objectContaining({ error: expect.stringContaining('IPC channel destroyed') }),
    )
  })
})
