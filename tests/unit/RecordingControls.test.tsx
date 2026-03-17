import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUseInterview = vi.fn()

vi.mock('../../src/renderer/src/contexts/InterviewContext', () => ({
  useInterview: () => mockUseInterview(),
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  Spinner: ({ size }: { size?: string }) => (
    <span data-testid="spinner" data-size={size}>Spinner</span>
  ),
  WaveformVisualizer: ({ isActive }: { isActive: boolean }) => (
    <span data-testid="waveform" data-active={isActive}>Waveform</span>
  ),
}))

vi.mock('../../src/renderer/src/components/ui/icons', () => ({
  MicrophoneIcon: () => <span data-testid="mic-icon">MicIcon</span>,
}))

import { RecordingControls } from '../../src/renderer/src/components/interview/RecordingControls'

describe('RecordingControls', () => {
  const mockHandleStart = vi.fn()
  const mockHandleStop = vi.fn()
  const mockHandleClear = vi.fn()

  const defaultContext = {
    isConnected: false,
    isCapturing: false,
    isLoading: false,
    transcripts: [] as TranscriptResult[],
    handleStart: mockHandleStart,
    handleStop: mockHandleStop,
    handleClear: mockHandleClear,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInterview.mockReturnValue(defaultContext)
  })

  // --- Initial state (not connected, no transcripts) ---

  it('should show start prompt when not connected and no transcripts', () => {
    render(<RecordingControls />)
    expect(screen.getByText('録音を開始してください')).toBeDefined()
  })

  it('should show start button when not connected', () => {
    render(<RecordingControls />)
    expect(screen.getByText('録音開始')).toBeDefined()
  })

  it('should show mic icon on start button when not loading', () => {
    render(<RecordingControls />)
    expect(screen.getByTestId('mic-icon')).toBeDefined()
  })

  it('should call handleStart when start button is clicked', () => {
    render(<RecordingControls />)
    fireEvent.click(screen.getByText('録音開始'))
    expect(mockHandleStart).toHaveBeenCalled()
  })

  // --- Loading state ---

  it('should show spinner instead of mic icon when loading', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, isLoading: true })
    render(<RecordingControls />)
    expect(screen.getByTestId('spinner')).toBeDefined()
    expect(screen.queryByTestId('mic-icon')).toBeNull()
  })

  it('should disable start button when loading', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, isLoading: true })
    render(<RecordingControls />)
    const button = screen.getByText('録音開始').closest('button')!
    expect(button.disabled).toBe(true)
  })

  // --- Recording state (connected and capturing) ---

  it('should show recording indicator when capturing', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
      isCapturing: true,
    })
    render(<RecordingControls />)
    expect(screen.getByText('録音中')).toBeDefined()
  })

  it('should show waveform visualizer when capturing', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
      isCapturing: true,
    })
    render(<RecordingControls />)
    expect(screen.getByTestId('waveform')).toBeDefined()
  })

  it('should show stop and clear buttons when connected', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
      isCapturing: true,
    })
    render(<RecordingControls />)
    expect(screen.getByText('録音停止')).toBeDefined()
    expect(screen.getByText('クリア')).toBeDefined()
  })

  it('should not show start button when connected', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
    })
    render(<RecordingControls />)
    expect(screen.queryByText('録音開始')).toBeNull()
  })

  it('should call handleStop when stop button is clicked', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
      isCapturing: true,
    })
    render(<RecordingControls />)
    fireEvent.click(screen.getByText('録音停止'))
    expect(mockHandleStop).toHaveBeenCalled()
  })

  it('should call handleClear when clear button is clicked', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
      isCapturing: true,
    })
    render(<RecordingControls />)
    fireEvent.click(screen.getByText('クリア'))
    expect(mockHandleClear).toHaveBeenCalled()
  })

  it('should disable stop button when loading', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isConnected: true,
      isCapturing: true,
      isLoading: true,
    })
    render(<RecordingControls />)
    const stopButton = screen.getByText('録音停止').closest('button')!
    expect(stopButton.disabled).toBe(true)
  })

  // --- Completed state (has transcripts, not capturing) ---

  it('should show completed status when has transcripts and not capturing', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      transcripts: [{ text: 'テスト', isFinal: true, confidence: 0.9, timestamp: Date.now() }],
    })
    render(<RecordingControls />)
    expect(screen.getByText('完了')).toBeDefined()
  })

  it('should not show start prompt when transcripts exist', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      transcripts: [{ text: 'テスト', isFinal: true, confidence: 0.9, timestamp: Date.now() }],
    })
    render(<RecordingControls />)
    expect(screen.queryByText('録音を開始してください')).toBeNull()
  })
})
