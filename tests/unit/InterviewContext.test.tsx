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

vi.mock('../../src/renderer/src/hooks/useAIResponse', () => ({
  useAIResponse: () => ({
    response: null,
    streamingText: '',
    isGenerating: false,
    error: null,
    currentPhase: null,
    generateStreamResponse: mockGenerateStreamResponse,
    abortGeneration: mockAbortGeneration,
    clearResponse: mockClearResponse,
  }),
}))

vi.mock('../../src/renderer/src/hooks/useProgressiveAI', () => ({
  useProgressiveAI: () => ({
    cachedMatch: null,
    refreshQuestionCache: mockRefreshQuestionCache,
    clearQuestionCache: mockClearQuestionCache,
    resetProgressiveAI: mockResetProgressiveAI,
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
    ;(window.electron.ai.warm as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
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

  it('should call warm AI on handleStart', async () => {
    renderWithProvider()
    await act(async () => {
      fireEvent.click(screen.getByTestId('startBtn'))
    })
    expect(window.electron.ai.warm).toHaveBeenCalled()
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
})
