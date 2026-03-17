import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

import { useSubscription } from '../../src/renderer/src/hooks/useSubscription'

const mockSub = window.electron.subscription

const defaultData = {
  subscription: { tier: 'free', status: 'active', periodEnd: null },
  usage: { sttMinutes: 5, aiTokens: 1000, storageBytes: 512000 },
  plan: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    limits: { sttMinutesMonthly: 30, aiTokensMonthly: 30000, storageBytesTotal: 52428800, maxDocuments: 3 },
    features: {},
  },
  plans: [],
}

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockSub.getPlans as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: defaultData,
    })
    ;(mockSub.checkout as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockSub.portal as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockSub.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: null })
  })

  it('should start with loading state', () => {
    const { result } = renderHook(() => useSubscription())
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should load subscription data on mount', async () => {
    const { result } = renderHook(() => useSubscription())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toEqual(defaultData)
  })

  it('should set error when fetch fails', async () => {
    ;(mockSub.getPlans as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSubscription())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.error).toBe('Network error')
  })

  it('should call checkout with priceId', async () => {
    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.checkout('price_pro_monthly')
    })

    expect(mockSub.checkout).toHaveBeenCalledWith('price_pro_monthly')
  })

  it('should set error when checkout fails', async () => {
    ;(mockSub.checkout as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Checkout エラー',
    })

    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.checkout('price_pro')
    })

    expect(result.current.error).toBe('Checkout エラー')
  })

  it('should set error when checkout throws', async () => {
    ;(mockSub.checkout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Checkout例外'))

    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.checkout('price_pro')
    })

    expect(result.current.error).toBe('Checkout例外')
  })

  it('should open portal', async () => {
    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.openPortal()
    })

    expect(mockSub.portal).toHaveBeenCalled()
  })

  it('should set error when portal fails', async () => {
    ;(mockSub.portal as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Portal エラー',
    })

    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.openPortal()
    })

    expect(result.current.error).toBe('Portal エラー')
  })

  it('should refresh data', async () => {
    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockSub.getPlans).toHaveBeenCalledTimes(2) // once on mount, once on refresh
  })

  it('should set error when openPortal throws', async () => {
    ;(mockSub.portal as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Portal例外'))

    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.openPortal()
    })

    expect(result.current.error).toBe('Portal例外')
  })

  it('should set error when refresh throws', async () => {
    ;(mockSub.getPlans as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ success: true, data: defaultData })
      .mockRejectedValueOnce(new Error('Refresh例外'))

    const { result } = renderHook(() => useSubscription())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.error).toBe('Refresh例外')
  })
})
