import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseInterview = vi.fn()

vi.mock('../../src/renderer/src/contexts/InterviewContext', () => ({
  InterviewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useInterview: () => mockUseInterview(),
}))

vi.mock('../../src/renderer/src/components/interview/TranscriptPanel', () => ({
  TranscriptPanel: () => <div data-testid="transcript-panel">TranscriptPanel</div>,
}))

vi.mock('../../src/renderer/src/components/interview/AIResponsePanel', () => ({
  AIResponsePanel: () => <div data-testid="ai-response-panel">AIResponsePanel</div>,
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  ErrorAlert: ({ error }: { error: string }) => <div data-testid="error-alert">{error}</div>,
}))

import { InterviewPage } from '../../src/renderer/src/components/pages/InterviewPage'

describe('InterviewPage', () => {
  const defaultInterviewState = {
    error: null as string | null,
    isConnected: false,
    transcripts: [],
    currentText: '',
    currentSource: undefined,
    isCapturing: false,
    audioSource: 'mic' as const,
    setAudioSource: vi.fn(),
    aiResponse: null,
    streamingText: '',
    isGenerating: false,
    currentPhase: null,
    cachedMatch: null,
    handleStart: vi.fn(),
    handleStop: vi.fn(),
    handleClear: vi.fn(),
    refreshQuestionCache: vi.fn(),
    isLoading: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInterview.mockReturnValue(defaultInterviewState)
  })

  it('should render TranscriptPanel', () => {
    render(<InterviewPage />)
    expect(screen.getByTestId('transcript-panel')).toBeDefined()
  })

  it('should render AIResponsePanel', () => {
    render(<InterviewPage />)
    expect(screen.getByTestId('ai-response-panel')).toBeDefined()
  })

  it('should not show error alert when no error', () => {
    render(<InterviewPage />)
    expect(screen.queryByTestId('error-alert')).toBeNull()
  })

  it('should show error alert when error exists', () => {
    mockUseInterview.mockReturnValue({ ...defaultInterviewState, error: '接続エラー' })
    render(<InterviewPage />)
    expect(screen.getByTestId('error-alert')).toBeDefined()
    expect(screen.getByText('接続エラー')).toBeDefined()
  })

  it('should render both panels side by side', () => {
    render(<InterviewPage />)
    expect(screen.getByTestId('transcript-panel')).toBeDefined()
    expect(screen.getByTestId('ai-response-panel')).toBeDefined()
  })
})
