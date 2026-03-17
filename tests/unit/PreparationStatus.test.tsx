import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockNavigateTo = vi.fn()
const mockUser = { value: null as User | null }

vi.mock('../../src/renderer/src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: mockUser.value,
  }),
}))

vi.mock('../../src/renderer/src/contexts/NavigationContext', () => ({
  useNavigation: () => ({
    navigateTo: mockNavigateTo,
  }),
}))

import { PreparationStatus } from '../../src/renderer/src/components/dashboard/PreparationStatus'

describe('PreparationStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUser.value = null
    ;(window.electron.document.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      documents: [],
    })
    ;(window.electron.questions.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      questions: [],
    })
  })

  it('should render preparation status title', async () => {
    render(<PreparationStatus />)
    await waitFor(() => {
      expect(screen.getByText('面接準備状況')).toBeDefined()
    })
  })

  it('should show 0% when nothing is prepared', async () => {
    render(<PreparationStatus />)
    await waitFor(() => {
      expect(screen.getByText(/0%/)).toBeDefined()
    })
  })

  it('should show status items', async () => {
    render(<PreparationStatus />)
    await waitFor(() => {
      expect(screen.getByText('プロフィール')).toBeDefined()
      expect(screen.getByText('履歴書')).toBeDefined()
      expect(screen.getByText('求人票')).toBeDefined()
      expect(screen.getByText('想定質問')).toBeDefined()
    })
  })

  it('should mark profile as completed when user has profile', async () => {
    mockUser.value = {
      id: '1',
      email: 'test@example.com',
      name: 'テスト',
      picture: null,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: null,
      usage: { sttMinutes: 0, aiTokens: 0, storageBytes: 0 },
      interviewProfile: { fullName: '田中太郎' },
    }

    render(<PreparationStatus />)
    await waitFor(() => {
      expect(screen.getByText(/25%/)).toBeDefined()
    })
  })

  it('should show 50% when 2 items are completed', async () => {
    mockUser.value = {
      id: '1',
      email: 'test@example.com',
      name: 'テスト',
      picture: null,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: null,
      usage: { sttMinutes: 0, aiTokens: 0, storageBytes: 0 },
      interviewProfile: { fullName: '田中太郎' },
    }
    ;(window.electron.document.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      documents: [{ id: '1', name: 'resume.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 5 }],
    })

    render(<PreparationStatus />)
    await waitFor(() => {
      expect(screen.getByText(/50%/)).toBeDefined()
    })
  })

  it('should navigate to correct page when status item is clicked', async () => {
    render(<PreparationStatus />)
    await waitFor(() => {
      expect(screen.getByText('プロフィール')).toBeDefined()
    })
    fireEvent.click(screen.getByText('プロフィール'))
    expect(mockNavigateTo).toHaveBeenCalledWith('profile')
  })

  it('should call document.list and questions.list on mount', async () => {
    render(<PreparationStatus />)
    await waitFor(() => {
      expect(window.electron.document.list).toHaveBeenCalled()
      expect(window.electron.questions.list).toHaveBeenCalled()
    })
  })

  it('should handle document.list failure gracefully', async () => {
    ;(window.electron.document.list as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))
    render(<PreparationStatus />)
    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByText('面接準備状況')).toBeDefined()
    })
  })
})
