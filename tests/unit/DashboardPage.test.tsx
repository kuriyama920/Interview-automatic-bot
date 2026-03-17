import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseSubscription = vi.fn()

vi.mock('../../src/renderer/src/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

vi.mock('../../src/renderer/src/components/ui/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <div data-testid="page-header">{title}</div>,
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  Spinner: ({ size }: { size?: string }) => <div data-testid="spinner">Loading</div>,
}))

vi.mock('../../src/renderer/src/components/ui/icons', () => ({
  MicrophoneIcon: ({ className }: { className?: string }) => <span data-testid="mic-icon">mic</span>,
  SparklesIcon: () => <span data-testid="sparkles-icon">sparkles</span>,
}))

vi.mock('../../src/renderer/src/components/dashboard/QuickStartCard', () => ({
  QuickStartCard: () => <div data-testid="quick-start-card">QuickStartCard</div>,
}))

vi.mock('../../src/renderer/src/components/dashboard/PreparationStatus', () => ({
  PreparationStatus: () => <div data-testid="preparation-status">PreparationStatus</div>,
}))

vi.mock('../../src/renderer/src/components/dashboard/UsageCard', () => ({
  UsageCard: ({ label, used, limit, unit }: { label: string; used: number; limit: number; unit: string }) => (
    <div data-testid={`usage-card-${label}`}>
      {label}: {used}/{limit} {unit}
    </div>
  ),
}))

import { DashboardPage } from '../../src/renderer/src/components/pages/DashboardPage'

describe('DashboardPage', () => {
  const mockRefresh = vi.fn()

  const defaultHookReturn = {
    data: null as null | {
      usage: { sttMinutes: number; aiTokens: number; storageBytes: number }
      plan: { limits: { sttMinutesMonthly: number; aiTokensMonthly: number; storageBytesTotal: number } } | null
    },
    isLoading: false,
    refresh: mockRefresh,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSubscription.mockReturnValue(defaultHookReturn)
  })

  it('should render the page header with dashboard title', () => {
    render(<DashboardPage />)
    expect(screen.getByText('ダッシュボード')).toBeDefined()
  })

  it('should render QuickStartCard', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('quick-start-card')).toBeDefined()
  })

  it('should render PreparationStatus', () => {
    render(<DashboardPage />)
    expect(screen.getByTestId('preparation-status')).toBeDefined()
  })

  it('should call refresh on mount', () => {
    render(<DashboardPage />)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should show spinner when loading', () => {
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, isLoading: true })
    render(<DashboardPage />)
    expect(screen.getByTestId('spinner')).toBeDefined()
  })

  it('should show usage cards when data is available', () => {
    const data = {
      usage: { sttMinutes: 10, aiTokens: 5000, storageBytes: 1048576 },
      plan: {
        limits: {
          sttMinutesMonthly: 30,
          aiTokensMonthly: 30000,
          storageBytesTotal: 52428800,
        },
      },
    }
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, data })
    render(<DashboardPage />)
    expect(screen.getByTestId('usage-card-音声認識 (STT)')).toBeDefined()
    expect(screen.getByTestId('usage-card-AIトークン')).toBeDefined()
    expect(screen.getByTestId('usage-card-ストレージ')).toBeDefined()
  })

  it('should show fetching message when no data and not loading', () => {
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, data: null, isLoading: false })
    render(<DashboardPage />)
    expect(screen.getByText('使用量データを取得中...')).toBeDefined()
  })

  it('should show section title for monthly usage', () => {
    const data = {
      usage: { sttMinutes: 0, aiTokens: 0, storageBytes: 0 },
      plan: {
        limits: {
          sttMinutesMonthly: 30,
          aiTokensMonthly: 30000,
          storageBytesTotal: 52428800,
        },
      },
    }
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, data })
    render(<DashboardPage />)
    expect(screen.getByText('今月の使用量')).toBeDefined()
  })

  it('should not show spinner when not loading', () => {
    const data = {
      usage: { sttMinutes: 0, aiTokens: 0, storageBytes: 0 },
      plan: {
        limits: {
          sttMinutesMonthly: 30,
          aiTokensMonthly: 30000,
          storageBytesTotal: 52428800,
        },
      },
    }
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, data })
    render(<DashboardPage />)
    expect(screen.queryByTestId('spinner')).toBeNull()
  })
})
