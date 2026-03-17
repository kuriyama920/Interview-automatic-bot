import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseInterview = vi.fn()

vi.mock('../../src/renderer/src/contexts/InterviewContext', () => ({
  useInterview: () => mockUseInterview(),
}))

vi.mock('../../src/renderer/src/components/interview/RecordingControls', () => ({
  RecordingControls: () => <div data-testid="recording-controls">RecordingControls</div>,
}))

vi.mock('../../src/renderer/src/components/interview/AudioSourceToggle', () => ({
  AudioSourceToggle: () => <div data-testid="audio-source-toggle">AudioSourceToggle</div>,
}))

vi.mock('../../src/renderer/src/components/ui/icons', () => ({
  MicrophoneIcon: ({ className }: { className?: string }) => (
    <svg data-testid="microphone-icon" className={className} />
  ),
}))

import { TranscriptPanel } from '../../src/renderer/src/components/interview/TranscriptPanel'

describe('TranscriptPanel', () => {
  const defaultContext = {
    transcripts: [] as { text: string; source: 'mic' | 'system'; timestamp: number }[],
    currentText: '',
    currentSource: 'mic' as const,
    isCapturing: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInterview.mockReturnValue(defaultContext)
  })

  it('should render RecordingControls', () => {
    render(<TranscriptPanel />)
    expect(screen.getByTestId('recording-controls')).toBeDefined()
  })

  it('should render AudioSourceToggle', () => {
    render(<TranscriptPanel />)
    expect(screen.getByTestId('audio-source-toggle')).toBeDefined()
  })

  it('should show empty state with mic icon when not capturing and no transcripts', () => {
    render(<TranscriptPanel />)
    expect(screen.getByTestId('microphone-icon')).toBeDefined()
    expect(screen.getByText('録音を開始すると、ここに文字起こしが表示されます')).toBeDefined()
  })

  it('should show typing indicator when capturing with no transcripts', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, isCapturing: true })
    render(<TranscriptPanel />)
    expect(screen.queryByText('録音を開始すると、ここに文字起こしが表示されます')).toBeNull()
    // Typing indicator renders 3 dots (spans)
  })

  it('should render transcript texts', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      transcripts: [
        { text: '自己紹介してください', source: 'system', timestamp: 1 },
        { text: '田中と申します', source: 'mic', timestamp: 2 },
      ],
    })
    render(<TranscriptPanel />)
    expect(screen.getByText('自己紹介してください')).toBeDefined()
    expect(screen.getByText('田中と申します')).toBeDefined()
  })

  it('should render source labels for speaker changes', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      transcripts: [
        { text: '面接官の質問', source: 'system', timestamp: 1 },
        { text: '私の回答', source: 'mic', timestamp: 2 },
      ],
    })
    render(<TranscriptPanel />)
    expect(screen.getByText('面接官')).toBeDefined()
    expect(screen.getByText('あなた')).toBeDefined()
  })

  it('should render current interim text', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      currentText: 'リアルタイムテキスト',
    })
    render(<TranscriptPanel />)
    expect(screen.getByText('リアルタイムテキスト')).toBeDefined()
  })

  it('should show typing indicator when capturing with transcripts but no currentText', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isCapturing: true,
      currentText: '',
      transcripts: [{ text: '既存のテキスト', source: 'mic', timestamp: 1 }],
    })
    render(<TranscriptPanel />)
    expect(screen.getByText('既存のテキスト')).toBeDefined()
  })
})
