/**
 * サブスクリプション管理フック (Phase 7)
 * useAuth.ts と同パターン
 */

import { useState, useEffect, useCallback, useRef } from 'react'

interface PlanLimits {
  sttMinutesMonthly: number
  aiTokensMonthly: number
  storageBytesTotal: number
  maxDocuments: number
}

interface SubscriptionData {
  subscription: {
    tier: 'free' | 'pro' | 'max'
    status: 'active' | 'canceled' | 'past_due' | 'trialing'
    periodEnd: string | null
  }
  usage: {
    sttMinutes: number
    aiTokens: number
    storageBytes: number
  }
  plan: {
    id: string
    name: string
    priceMonthly: number
    limits: PlanLimits
    features: Record<string, boolean>
  } | null
  plans: Array<{
    id: string
    name: string
    priceMonthly: number
    priceYearly: number | null
    stripePriceIdMonthly: string | null
    stripePriceIdYearly: string | null
    limits: PlanLimits
    features: Record<string, boolean>
  }>
}

interface UseSubscriptionResult {
  data: SubscriptionData | null
  isLoading: boolean
  error: string | null
  checkout: (priceId: string) => Promise<void>
  openPortal: () => Promise<void>
  refresh: () => Promise<void>
}

export function useSubscription(): UseSubscriptionResult {
  const [data, setData] = useState<SubscriptionData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 初回マウント時にサブスクリプション情報を取得
  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await window.electron.subscription.getPlans()
        if (result.success && result.data) {
          setData(result.data as SubscriptionData)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()

    return () => {
      if (pollingTimerRef.current) {
        clearTimeout(pollingTimerRef.current)
      }
    }
  }, [])

  // Checkout 後のポーリングを開始
  const startPolling = useCallback(
    (currentTier: string) => {
      let attempts = 0
      const maxAttempts = 20
      const interval = 3000

      const poll = async () => {
        if (attempts >= maxAttempts) return
        attempts++

        try {
          const result = await window.electron.subscription.getPlans()
          if (result.success && result.data) {
            const newData = result.data as SubscriptionData
            if (newData.subscription.tier !== currentTier) {
              // 認証情報をリフレッシュしてからUI更新（最新状態を反映）
              await window.electron.subscription.refresh()
              const refreshed = await window.electron.subscription.getPlans()
              setData(
                refreshed.success && refreshed.data
                  ? (refreshed.data as SubscriptionData)
                  : newData
              )
              return
            }
          }
        } catch {
          // ポーリングエラーは無視して継続
        }

        pollingTimerRef.current = setTimeout(poll, interval)
      }

      // Checkout には時間がかかるため 5 秒後にポーリング開始
      pollingTimerRef.current = setTimeout(poll, 5000)
    },
    []
  )

  const checkout = useCallback(
    async (priceId: string) => {
      setError(null)
      try {
        const result = await window.electron.subscription.checkout(priceId)
        if (!result.success) {
          setError(result.error || 'Checkout に失敗しました')
          return
        }
        // ブラウザでCheckoutが開かれた後、ポーリングで tier 変更を検知
        const currentTier = data?.subscription.tier || 'free'
        startPolling(currentTier)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [data, startPolling]
  )

  const openPortal = useCallback(async () => {
    setError(null)
    try {
      const result = await window.electron.subscription.portal()
      if (!result.success) {
        setError(result.error || 'Customer Portal を開けませんでした')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const result = await window.electron.subscription.getPlans()
      if (result.success && result.data) {
        setData(result.data as SubscriptionData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  return { data, isLoading, error, checkout, openPortal, refresh }
}
