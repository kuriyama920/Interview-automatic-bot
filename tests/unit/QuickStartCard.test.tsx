import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockNavigateTo = vi.fn()
const mockIsRecording = { value: false }

vi.mock('../../src/renderer/src/contexts/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
    isRecording: mockIsRecording.value,
  }),
}))

import { QuickStartCard } from '../../src/renderer/src/components/dashboard/QuickStartCard'

describe('QuickStartCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRecording.value = false
  })

  it('should render start interview title when not recording', () => {
    render(<QuickStartCard />)
    expect(screen.getByText('面接を開始')).toBeDefined()
  })

  it('should render start button when not recording', () => {
    render(<QuickStartCard />)
    expect(screen.getByText('開始する')).toBeDefined()
  })

  it('should navigate to interview page on button click', () => {
    render(<QuickStartCard />)
    fireEvent.click(screen.getByText('開始する'))
    expect(mockNavigateTo).toHaveBeenCalledWith('interview')
  })

  it('should show recording state text when recording', () => {
    mockIsRecording.value = true
    render(<QuickStartCard />)
    expect(screen.getByText('録音中...')).toBeDefined()
  })

  it('should show return button when recording', () => {
    mockIsRecording.value = true
    render(<QuickStartCard />)
    expect(screen.getByText('面接に戻る')).toBeDefined()
  })

  it('should navigate to interview page even when recording', () => {
    mockIsRecording.value = true
    render(<QuickStartCard />)
    fireEvent.click(screen.getByText('面接に戻る'))
    expect(mockNavigateTo).toHaveBeenCalledWith('interview')
  })
})
