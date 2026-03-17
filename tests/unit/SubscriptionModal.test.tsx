import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUseSubscription = vi.fn()

vi.mock('../../src/renderer/src/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

import { SubscriptionModal } from '../../src/renderer/src/components/SubscriptionModal'

describe('SubscriptionModal', () => {
  const mockCheckout = vi.fn()
  const mockOpenPortal = vi.fn()
  const mockRefresh = vi.fn()
  const mockOnClose = vi.fn()

  const defaultSubscriptionData = {
    subscription: {
      tier: 'free' as const,
      status: 'active' as const,
      periodEnd: null,
    },
    usage: {
      sttMinutes: 10,
      aiTokens: 5000,
      storageBytes: 1048576,
    },
    plan: {
      id: 'free',
      name: 'Free',
      priceMonthly: 0,
      stripePriceIdMonthly: null,
      limits: {
        sttMinutesMonthly: 30,
        aiTokensMonthly: 30000,
        storageBytesTotal: 52428800,
        maxDocuments: 3,
      },
      features: {},
    },
    plans: [
      {
        id: 'free',
        name: 'Free',
        priceMonthly: 0,
        stripePriceIdMonthly: null,
        limits: {
          sttMinutesMonthly: 30,
          aiTokensMonthly: 30000,
          storageBytesTotal: 52428800,
          maxDocuments: 3,
        },
        features: {},
      },
      {
        id: 'pro',
        name: 'Pro',
        priceMonthly: 2980,
        stripePriceIdMonthly: 'price_pro',
        limits: {
          sttMinutesMonthly: 600,
          aiTokensMonthly: 500000,
          storageBytesTotal: 524288000,
          maxDocuments: 50,
        },
        features: { priority_support: false },
      },
      {
        id: 'max',
        name: 'Max',
        priceMonthly: 14800,
        stripePriceIdMonthly: 'price_max',
        limits: {
          sttMinutesMonthly: 3000,
          aiTokensMonthly: 5000000,
          storageBytesTotal: -1,
          maxDocuments: 200,
        },
        features: { priority_support: true },
      },
    ],
  }

  const defaultHookReturn = {
    data: defaultSubscriptionData,
    isLoading: false,
    error: null as string | null,
    checkout: mockCheckout,
    openPortal: mockOpenPortal,
    refresh: mockRefresh,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSubscription.mockReturnValue(defaultHookReturn)
  })

  it('should return null when not open', () => {
    const { container } = render(<SubscriptionModal isOpen={false} onClose={mockOnClose} />)
    expect(container.innerHTML).toBe('')
  })

  it('should render modal when open', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    expect(screen.getByText('プラン管理')).toBeDefined()
  })

  it('should call refresh when opened', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should call onClose when overlay is clicked', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    const overlay = document.querySelector('.bg-black\\/40')
    if (overlay) {
      fireEvent.click(overlay)
      expect(mockOnClose).toHaveBeenCalled()
    }
  })

  it('should show usage bars', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    expect(screen.getByText('音声認識 (STT)')).toBeDefined()
    expect(screen.getByText('AIトークン')).toBeDefined()
  })

  it('should show plan cards', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    const freeElements = screen.getAllByText('Free')
    expect(freeElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Pro')).toBeDefined()
    expect(screen.getByText('Max')).toBeDefined()
  })

  it('should show loading state', () => {
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, isLoading: true, data: null })
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    expect(screen.getByText('プラン管理')).toBeDefined()
  })

  it('should show error when error exists', () => {
    mockUseSubscription.mockReturnValue({ ...defaultHookReturn, error: 'データ取得エラー' })
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    expect(screen.getByText(/データ取得/)).toBeDefined()
  })

  it('should show current plan indicator', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    const elements = screen.getAllByText(/現在のプラン/)
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('should show upgrade buttons for non-current plans', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    const upgradeButtons = screen.getAllByText('アップグレード')
    expect(upgradeButtons.length).toBe(2)
  })

  it('should call checkout when upgrade button is clicked', () => {
    render(<SubscriptionModal isOpen={true} onClose={mockOnClose} />)
    const upgradeButtons = screen.getAllByText('アップグレード')
    fireEvent.click(upgradeButtons[0])
    expect(mockCheckout).toHaveBeenCalledWith('price_pro')
  })
})
