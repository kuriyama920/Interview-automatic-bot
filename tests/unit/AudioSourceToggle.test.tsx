import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUseInterview = vi.fn()

vi.mock('../../src/renderer/src/contexts/InterviewContext', () => ({
  useInterview: () => mockUseInterview(),
}))

import { AudioSourceToggle } from '../../src/renderer/src/components/interview/AudioSourceToggle'

describe('AudioSourceToggle', () => {
  const mockSetAudioSource = vi.fn()

  const defaultContext = {
    audioSource: 'mic' as const,
    setAudioSource: mockSetAudioSource,
    isCapturing: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInterview.mockReturnValue(defaultContext)
  })

  it('should render current audio source label for mic', () => {
    render(<AudioSourceToggle />)
    // 'マイク' appears in both the label span and the toggle button
    const elements = screen.getAllByText('マイク')
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('should render current audio source label for system', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, audioSource: 'system' })
    render(<AudioSourceToggle />)
    expect(screen.getByText('システム音声')).toBeDefined()
  })

  it('should render current audio source label for both', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, audioSource: 'both' })
    render(<AudioSourceToggle />)
    expect(screen.getByText('マイク＋システム音声')).toBeDefined()
  })

  it('should render toggle buttons when not capturing', () => {
    render(<AudioSourceToggle />)
    expect(screen.getByText('システム')).toBeDefined()
    const micElements = screen.getAllByText('マイク')
    expect(micElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('両方')).toBeDefined()
  })

  it('should hide toggle buttons when capturing', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, isCapturing: true })
    render(<AudioSourceToggle />)
    expect(screen.queryByText('システム')).toBeNull()
    expect(screen.queryByText('両方')).toBeNull()
  })

  it('should call setAudioSource with system when system button clicked', () => {
    render(<AudioSourceToggle />)
    fireEvent.click(screen.getByText('システム'))
    expect(mockSetAudioSource).toHaveBeenCalledWith('system')
  })

  it('should call setAudioSource with mic when mic button clicked', () => {
    mockUseInterview.mockReturnValue({ ...defaultContext, audioSource: 'system' })
    render(<AudioSourceToggle />)
    fireEvent.click(screen.getByText('マイク'))
    expect(mockSetAudioSource).toHaveBeenCalledWith('mic')
  })

  it('should call setAudioSource with both when both button clicked', () => {
    render(<AudioSourceToggle />)
    fireEvent.click(screen.getByText('両方'))
    expect(mockSetAudioSource).toHaveBeenCalledWith('both')
  })

  it('should still show the audio source label when capturing', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      audioSource: 'both',
      isCapturing: true,
    })
    render(<AudioSourceToggle />)
    expect(screen.getByText('マイク＋システム音声')).toBeDefined()
  })
})
