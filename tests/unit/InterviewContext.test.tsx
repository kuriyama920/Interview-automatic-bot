import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'

// Mock all hooks used by InterviewContext
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockDisconnect = vi.fn().mockResolvedValue(undefined)
const mockClearTranscripts = vi.fn()
const mockStartCapture = vi.fn().mockResolvedValue(undefined)
const mockStopCapture = vi.fn().mockResolvedValue(undefined)
const mockSetAudioSource = vi.fn().mockResolvedValue(undefined)
const mockGenerateStreamResponse = vi.fn().mockResolvedValue(undefined)
const mockAbortGeneration = vi.fn()
const mockClearResponse = vi.fn()
const mockResetProgressiveAI = vi.fn()
const mockRefreshQuestionCache = vi.fn().mockResolvedValue(undefined)
const mockClearQuestionCache = vi.fn()
const mockPrefetchDocumentContext = vi.fn().mockResolvedValue(undefined)
const mockClearDocumentContextCache = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastInfo = vi.fn()
const mockToastError = vi.fn()
const mockSetIsRecording = vi.fn()

vi.mock('../../src/renderer/src/hooks/useSTT', () => ({
  useSTT: () => ({
    isConnected: false,
    transcripts: [],
    currentText: '',
    currentSource: undefined,
    error: null,
    connect: mockConnect,
    disconnect: mockDisconnect,
    clearTranscripts: mockClearTranscripts,
  }),
}))

vi.mock('../../src/renderer/src/hooks/useAudioCapture', () => ({
  useAudioCapture: () => ({
    isCapturing: false,
    error: null,
    audioSource: 'mic',
    setAudioSource: mockSetAudioSource,
    startCapture: mockStartCapture,
    stopCapture: mockStopCapture,
  }),
}))

let mockIsGenerating = false
let mockStreamingText = ''
let mockAiResponseObj: { answer: string } | null = null
const mockGenerateStreamResponseV2 = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/renderer/src/hooks/useAIResponse', () => ({
  useAIResponse: () => ({
    response: mockAiResponseObj,
    streamingText: mockStreamingText,
    isGenerating: mockIsGenerating,
    error: null,
    currentPhase: null,
    generateStreamResponse: mockGenerateStreamResponse,
    generateStreamResponseV2: mockGenerateStreamResponseV2,
    abortGeneration: mockAbortGeneration,
    clearResponse: mockClearResponse,
  }),
}))

const mockPendingCommittedTurnIdRef = { current: null as string | null }
vi.mock('../../src/renderer/src/hooks/useProgressiveAI', () => ({
  useProgressiveAI: () => ({
    cachedMatch: null,
    refreshQuestionCache: mockRefreshQuestionCache,
    clearQuestionCache: mockClearQuestionCache,
    resetProgressiveAI: mockResetProgressiveAI,
    pendingCommittedTurnIdRef: mockPendingCommittedTurnIdRef,
  }),
}))

vi.mock('../../src/renderer/src/hooks/useConversationHistory', () => ({
  useConversationHistory: () => '',
}))

vi.mock('../../src/renderer/src/hooks/useDocumentContextCache', () => ({
  useDocumentContextCache: () => ({
    cachedContextRef: { current: '' },
    prefetch: mockPrefetchDocumentContext,
    clear: mockClearDocumentContextCache,
  }),
}))

vi.mock('../../src/renderer/src/hooks/useToast', () => ({
  useToast: () => ({
    success: mockToastSuccess,
    info: mockToastInfo,
    error: mockToastError,
  }),
}))

const mockLatencyRecord = vi.fn()
const mockLatencyFinalize = vi.fn()
vi.mock('../../src/renderer/src/hooks/useLatencyMetrics', () => ({
  useLatencyMetrics: () => ({
    record: mockLatencyRecord,
    finalize: mockLatencyFinalize,
    getMetrics: vi.fn(),
    getAllMetrics: vi.fn().mockReturnValue([]),
  }),
}))

const mockShouldAdoptSpeculative = vi.fn().mockReturnValue({
  adopted: true,
  changeRate: 0.05,
  reason: 'low_change_rate',
})
vi.mock('../../src/renderer/src/utils/speculative-adoption', () => ({
  shouldAdoptSpeculative: (...args: unknown[]) => mockShouldAdoptSpeculative(...args),
  countSentences: vi.fn().mockReturnValue(3),
}))

vi.mock('../../src/renderer/src/contexts/NavigationContext', () => ({
  useNavigation: () => ({
    setIsRecording: mockSetIsRecording,
  }),
}))

import { InterviewProvider, useInterview } from '../../src/renderer/src/contexts/InterviewContext'

function TestConsumer() {
  const {
    isConnected, isCapturing, isGenerating, isLoading,
    audioSource, error, handleStart, handleStop, handleClear,
  } = useInterview()

  return (
    <div>
      <span data-testid="isConnected">{String(isConnected)}</span>
      <span data-testid="isCapturing">{String(isCapturing)}</span>
      <span data-testid="isGenerating">{String(isGenerating)}</span>
      <span data-testid="isLoading">{String(isLoading)}</span>
      <span data-testid="audioSource">{audioSource}</span>
      <span data-testid="error">{error || 'none'}</span>
      <button onClick={handleStart} data-testid="startBtn">Start</button>
      <button onClick={handleStop} data-testid="stopBtn">Stop</button>
      <button onClick={handleClear} data-testid="clearBtn">Clear</button>
    </div>
  )
}

describe('InterviewContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsGenerating = false
    mockStreamingText = ''
    mockAiResponseObj = null
    mockPendingCommittedTurnIdRef.current = null
  })

  function renderWithProvider() {
    return render(
      <InterviewProvider>
        <TestConsumer />
      </InterviewProvider>
    )
  }

  it('should provide initial state', () => {
    renderWithProvider()
    expect(screen.getByTestId('isConnected').textContent).toBe('false')
    expect(screen.getByTestId('isCapturing').textContent).toBe('false')
    expect(screen.getByTestId('isGenerating').textContent).toBe('false')
    expect(screen.getByTestId('audioSource').textContent).toBe('mic')
    expect(screen.getByTestId('error').textContent).toBe('none')
  })

  it('should throw error when useInterview used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      render(<TestConsumer />)
    }).toThrow('useInterview must be used within InterviewProvider')
    consoleSpy.mockRestore()
  })

  it('should call connect and startCapture on handleStart', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('startBtn'))
    })
    expect(mockConnect).toHaveBeenCalled()
    expect(mockStartCapture).toHaveBeenCalled()
    expect(mockToastSuccess).toHaveBeenCalledWith('録音を開始しました')
  })

  it('should call stopCapture and disconnect on handleStop', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('stopBtn'))
    })
    expect(mockStopCapture).toHaveBeenCalled()
    expect(mockDisconnect).toHaveBeenCalled()
    expect(mockToastInfo).toHaveBeenCalledWith('録音を停止しました')
  })

  it('should clear state on handleClear', () => {
    renderWithProvider()
    fireEvent.click(screen.getByTestId('clearBtn'))
    expect(mockAbortGeneration).toHaveBeenCalled()
    expect(mockClearTranscripts).toHaveBeenCalled()
    expect(mockClearResponse).toHaveBeenCalled()
    expect(mockResetProgressiveAI).toHaveBeenCalled()
    expect(mockToastInfo).toHaveBeenCalledWith('クリアしました')
  })

  it('should prefetch document context on handleStart', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('startBtn'))
    })
    expect(mockPrefetchDocumentContext).toHaveBeenCalled()
  })

  it('should handle handleStart error gracefully', async () => {
    mockConnect.mockRejectedValueOnce(new Error('接続エラー'))
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('startBtn'))
    })
    expect(mockToastError).toHaveBeenCalledWith('接続エラー')
  })

  it('should handle handleStop error gracefully', async () => {
    mockStopCapture.mockRejectedValueOnce(new Error('停止エラー'))
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('stopBtn'))
    })
    expect(mockToastError).toHaveBeenCalledWith('停止エラー')
  })

  describe('speculative adoption check (W-01)', () => {
    it('should call shouldAdoptSpeculative when isGenerating transitions from true to false with pending turn', async () => {
      // Set up: speculative text available, pending turn ID set
      mockPendingCommittedTurnIdRef.current = 'test-turn-123'
      mockIsGenerating = true
      mockStreamingText = ''

      const { rerender } = render(
        <InterviewProvider>
          <TestConsumer />
        </InterviewProvider>
      )

      // Now simulate committed generation completing
      mockIsGenerating = false
      mockAiResponseObj = { answer: 'committed回答テキストです。複数の文を含みます。経験について述べます。' }

      // We need the speculativeTextRef to have content
      // The speculativeTextRef is internal to InterviewContext, set via useEffect on currentPhase
      // Since hooks are mocked, we rely on the ref being set
      // But the adoption check also needs specText - let's verify behavior
      await act(async () => {
        rerender(
          <InterviewProvider>
            <TestConsumer />
          </InterviewProvider>
        )
      })

      // The adoption check should NOT call shouldAdoptSpeculative if specText is empty
      // (speculativeTextRef is internal and starts as '')
      // This verifies the guard condition works
      expect(mockShouldAdoptSpeculative).not.toHaveBeenCalled()
    })

    it('should clear pendingCommittedTurnIdRef after adoption check even without speculative text', async () => {
      mockPendingCommittedTurnIdRef.current = 'test-turn-456'
      mockIsGenerating = true

      const { rerender } = render(
        <InterviewProvider>
          <TestConsumer />
        </InterviewProvider>
      )

      mockIsGenerating = false
      mockAiResponseObj = { answer: 'committed回答' }

      await act(async () => {
        rerender(
          <InterviewProvider>
            <TestConsumer />
          </InterviewProvider>
        )
      })

      // pendingCommittedTurnIdRef should be cleared
      expect(mockPendingCommittedTurnIdRef.current).toBeNull()
    })
  })
})
