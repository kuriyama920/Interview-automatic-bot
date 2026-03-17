import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockCheckout = vi.fn()
const mockOpenPortal = vi.fn()
const mockRefresh = vi.fn()

const mockUseSubscription = vi.fn()

vi.mock('../../src/renderer/src/hooks/useSubscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

vi.mock('../../src/renderer/src/components/ui/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="page-header">
      <span>{title}</span>
      {subtitle && <span>{subtitle}</span>}
    </div>
  ),
}))

vi.mock('../../src/renderer/src/utils/errorMessages', () => ({
  formatErrorMessage: (error: string) => ({ message: error, hint: null }),
}))

import { SubscriptionPage } from '../../src/renderer/src/components/pages/SubscriptionPage'

// ─── Test Data ──────────────────────────────────────────────────────

const freePlan = {
  id: 'free',
  name: 'Free',
  priceMonthly: 0,
  stripePriceIdMonthly: null,
  stripePriceIdYearly: null,
  priceYearly: null,
  limits: {
    sttMinutesMonthly: 30,
    aiTokensMonthly: 30000,
    storageBytesTotal: 52428800,
    maxDocuments: 3,
  },
  features: {},
}

const proPlan = {
  id: 'pro',
  name: 'Pro',
  priceMonthly: 2980,
  stripePriceIdMonthly: 'price_pro_monthly',
  stripePriceIdYearly: null,
  priceYearly: null,
  limits: {
    sttMinutesMonthly: 600,
    aiTokensMonthly: 500000,
    storageBytesTotal: 524288000,
    maxDocuments: 50,
  },
  features: { priority_support: false },
}

const maxPlan = {
  id: 'max',
  name: 'Max',
  priceMonthly: 14800,
  stripePriceIdMonthly: 'price_max_monthly',
  stripePriceIdYearly: null,
  priceYearly: null,
  limits: {
    sttMinutesMonthly: 3000,
    aiTokensMonthly: 5000000,
    storageBytesTotal: -1,
    maxDocuments: 200,
  },
  features: { priority_support: true },
}

const defaultSubscriptionData = {
  subscription: {
    tier: 'free' as const,
    status: 'active' as const,
    periodEnd: null,
  },
  usage: {
    sttMinutes: 10,
    aiTokens: 5000,
    storageBytes: 1048576, // 1MB
  },
  plan: freePlan,
  plans: [freePlan, proPlan, maxPlan],
}

const defaultHookReturn = {
  data: defaultSubscriptionData,
  isLoading: false,
  error: null as string | null,
  checkout: mockCheckout,
  openPortal: mockOpenPortal,
  refresh: mockRefresh,
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('SubscriptionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSubscription.mockReturnValue(defaultHookReturn)
  })

  // ── Rendering ───────────────────────────────────────────────────

  it('should render the page header with title', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('プラン管理')).toBeDefined()
  })

  it('should render the current plan name in the subtitle', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText(/現在のプラン: Free/)).toBeDefined()
  })

  it('should render subtitle with fallback when plan is null', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: { ...defaultSubscriptionData, plan: null },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText(/現在のプラン: Free/)).toBeDefined()
  })

  it('should call refresh on mount', () => {
    render(<SubscriptionPage />)
    expect(mockRefresh).toHaveBeenCalled()
  })

  // ── Loading State ───────────────────────────────────────────────

  it('should show spinner when loading', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      isLoading: true,
      data: null,
    })
    render(<SubscriptionPage />)
    // Spinner renders an svg with animate-spin
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeTruthy()
  })

  it('should not show plan cards when loading', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      isLoading: true,
      data: null,
    })
    render(<SubscriptionPage />)
    expect(screen.queryByText('Pro')).toBeNull()
  })

  // ── Error State ─────────────────────────────────────────────────

  it('should show error alert when error exists', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      error: 'サーバーエラーが発生しました',
    })
    render(<SubscriptionPage />)
    expect(screen.getByText(/サーバーエラーが発生しました/)).toBeDefined()
  })

  it('should not show error alert when error is null', () => {
    render(<SubscriptionPage />)
    expect(screen.queryByText(/エラー/)).toBeNull()
  })

  // ── Empty Data State ────────────────────────────────────────────

  it('should show fallback message when data is null and not loading', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      isLoading: false,
      data: null,
    })
    render(<SubscriptionPage />)
    expect(screen.getByText('サブスクリプション情報を取得できませんでした')).toBeDefined()
  })

  // ── Usage Section ───────────────────────────────────────────────

  it('should display usage bars with labels', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('音声認識 (STT)')).toBeDefined()
    expect(screen.getByText('AIトークン')).toBeDefined()
    expect(screen.getByText('ドキュメント容量')).toBeDefined()
  })

  it('should display usage section title', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('今月の使用量')).toBeDefined()
  })

  it('should display STT usage values', () => {
    render(<SubscriptionPage />)
    // "10 / 30 分"
    expect(screen.getByText('10 / 30 分')).toBeDefined()
  })

  it('should display AI token usage values', () => {
    render(<SubscriptionPage />)
    // Usage bar shows "5,000 / 30,000 " - use getAllByText since "5,000" also appears in plan card "5,000,000"
    const elements = screen.getAllByText(/5,000/)
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('should display storage usage in MB', () => {
    render(<SubscriptionPage />)
    // 1048576 bytes = 1MB, limit 52428800 bytes = 50MB
    expect(screen.getByText('1 / 50 MB')).toBeDefined()
  })

  it('should show unlimited text for unlimited storage', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: { tier: 'max', status: 'active', periodEnd: null },
        plan: maxPlan,
      },
    })
    render(<SubscriptionPage />)
    // storageBytesTotal is -1 for max plan
    expect(screen.getByText(/無制限/)).toBeDefined()
  })

  // ── UsageBar warning/danger states ──────────────────────────────

  it('should show warning style when usage is at 80%', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        usage: { sttMinutes: 24, aiTokens: 5000, storageBytes: 1048576 },
      },
    })
    render(<SubscriptionPage />)
    // 24/30 = 80%, should trigger warning color (bg-warning)
    const bars = document.querySelectorAll('.bg-warning')
    expect(bars.length).toBeGreaterThanOrEqual(1)
  })

  it('should show danger style when usage is at 95%+', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        usage: { sttMinutes: 29, aiTokens: 5000, storageBytes: 1048576 },
      },
    })
    render(<SubscriptionPage />)
    // 29/30 = 96.7%, should trigger danger color (bg-error)
    const bars = document.querySelectorAll('.bg-error')
    expect(bars.length).toBeGreaterThanOrEqual(1)
  })

  // ── Plan Cards ──────────────────────────────────────────────────

  it('should show plan list title', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('プラン一覧')).toBeDefined()
  })

  it('should render all plan cards', () => {
    render(<SubscriptionPage />)
    const freeElements = screen.getAllByText('Free')
    expect(freeElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Pro')).toBeDefined()
    expect(screen.getByText('Max')).toBeDefined()
  })

  it('should display plan prices', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('無料')).toBeDefined()
    expect(screen.getByText(/2,980/)).toBeDefined()
    expect(screen.getByText(/14,800/)).toBeDefined()
  })

  it('should show monthly suffix for paid plans', () => {
    render(<SubscriptionPage />)
    const monthlySuffixes = screen.getAllByText('/ 月')
    expect(monthlySuffixes.length).toBe(2) // pro and max
  })

  it('should display STT limits in plan cards', () => {
    render(<SubscriptionPage />)
    // STT rendered as "${sttMinutesMonthly}分/月" - no comma formatting
    expect(screen.getByText(/30分\/月/)).toBeDefined()
    expect(screen.getByText(/600分\/月/)).toBeDefined()
    expect(screen.getByText(/3000分\/月/)).toBeDefined()
  })

  it('should display AI token limits in plan cards', () => {
    render(<SubscriptionPage />)
    // Checks for the plan card feature list
    expect(screen.getByText(/30,000\/月/)).toBeDefined()
    expect(screen.getByText(/500,000\/月/)).toBeDefined()
    expect(screen.getByText(/5,000,000\/月/)).toBeDefined()
  })

  it('should display document limits in plan cards', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText(/3件/)).toBeDefined()
    expect(screen.getByText(/50件/)).toBeDefined()
    expect(screen.getByText(/200件/)).toBeDefined()
  })

  it('should show priority support for max plan', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('優先サポート')).toBeDefined()
  })

  it('should show "おすすめ" badge for pro plan when not current', () => {
    render(<SubscriptionPage />)
    expect(screen.getByText('おすすめ')).toBeDefined()
  })

  it('should not show "おすすめ" badge when pro is current plan', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: { tier: 'pro', status: 'active', periodEnd: null },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    expect(screen.queryByText('おすすめ')).toBeNull()
  })

  // ── Current Plan Button ─────────────────────────────────────────

  it('should show "現在のプラン" button for current tier', () => {
    render(<SubscriptionPage />)
    const currentPlanButtons = screen.getAllByText('現在のプラン')
    expect(currentPlanButtons.length).toBeGreaterThanOrEqual(1)
    // The current plan button should be disabled
    const btn = currentPlanButtons[0].closest('button')
    expect(btn?.disabled).toBe(true)
  })

  it('should show "-" for free plan card when free is not current', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: { tier: 'pro', status: 'active', periodEnd: null },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText('-')).toBeDefined()
  })

  // ── Upgrade Buttons ─────────────────────────────────────────────

  it('should show upgrade buttons for non-current paid plans', () => {
    render(<SubscriptionPage />)
    const upgradeButtons = screen.getAllByText('アップグレード')
    expect(upgradeButtons.length).toBe(2) // pro and max
  })

  it('should call checkout with correct priceId when upgrade is clicked', () => {
    render(<SubscriptionPage />)
    const upgradeButtons = screen.getAllByText('アップグレード')
    fireEvent.click(upgradeButtons[0])
    expect(mockCheckout).toHaveBeenCalledWith('price_pro_monthly')
  })

  it('should call checkout with max plan priceId', () => {
    render(<SubscriptionPage />)
    const upgradeButtons = screen.getAllByText('アップグレード')
    fireEvent.click(upgradeButtons[1])
    expect(mockCheckout).toHaveBeenCalledWith('price_max_monthly')
  })

  it('should show "準備中" for plans without stripePriceIdMonthly', () => {
    const planWithoutStripe = {
      ...proPlan,
      id: 'enterprise',
      name: 'Enterprise',
      stripePriceIdMonthly: null,
    }
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        plans: [freePlan, planWithoutStripe],
      },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText('準備中')).toBeDefined()
  })

  // ── Customer Portal ─────────────────────────────────────────────

  it('should not show customer portal section for free tier', () => {
    render(<SubscriptionPage />)
    expect(screen.queryByText('サブスクリプション管理')).toBeNull()
  })

  it('should show customer portal section for paid tier', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: { tier: 'pro', status: 'active', periodEnd: null },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText('サブスクリプション管理')).toBeDefined()
    expect(screen.getByText(/支払い方法の変更/)).toBeDefined()
  })

  it('should call openPortal when management button is clicked', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: { tier: 'pro', status: 'active', periodEnd: null },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    fireEvent.click(screen.getByText('管理画面を開く'))
    expect(mockOpenPortal).toHaveBeenCalled()
  })

  // ── Subscription Period Info ─────────────────────────────────────

  it('should not show period info when periodEnd is null', () => {
    render(<SubscriptionPage />)
    expect(screen.queryByText(/次回更新日/)).toBeNull()
  })

  it('should show period end date when available', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: {
          tier: 'pro',
          status: 'active',
          periodEnd: '2026-04-10T00:00:00Z',
        },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText(/次回更新日/)).toBeDefined()
    expect(screen.getByText(/2026/)).toBeDefined()
  })

  it('should show canceled notice for canceled subscription', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: {
          tier: 'pro',
          status: 'canceled',
          periodEnd: '2026-04-10T00:00:00Z',
        },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText(/キャンセル済み/)).toBeDefined()
    expect(screen.getByText(/Freeプランに移行/)).toBeDefined()
  })

  it('should show past_due notice for past due subscription', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: {
          tier: 'pro',
          status: 'past_due',
          periodEnd: '2026-04-10T00:00:00Z',
        },
        plan: proPlan,
      },
    })
    render(<SubscriptionPage />)
    expect(screen.getByText(/支払い遅延中/)).toBeDefined()
  })

  // ── Combined States ─────────────────────────────────────────────

  it('should show both error and data when both are present', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      error: '更新失敗',
    })
    render(<SubscriptionPage />)
    // Error should be shown
    expect(screen.getByText(/更新失敗/)).toBeDefined()
    // Data should still be rendered
    expect(screen.getByText('Pro')).toBeDefined()
  })

  it('should handle max tier as current plan correctly', () => {
    mockUseSubscription.mockReturnValue({
      ...defaultHookReturn,
      data: {
        ...defaultSubscriptionData,
        subscription: { tier: 'max', status: 'active', periodEnd: null },
        plan: maxPlan,
      },
    })
    render(<SubscriptionPage />)
    const currentPlanButtons = screen.getAllByText('現在のプラン')
    expect(currentPlanButtons.length).toBe(1)
  })
})
