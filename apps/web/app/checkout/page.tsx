'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  createAuthSession,
  pollAuthSession,
  createStripeCheckout,
  getPriceIdForPlan,
} from '@/lib/api'

const PLAN_INFO: Record<
  string,
  { name: string; price: number; description: string; features: string[] }
> = {
  pro: {
    name: 'Pro',
    price: 2980,
    description: '本格的な面接対策に',
    features: [
      '音声認識（STT） 600分 / 月',
      'AIトークン 500,000 / 月',
      'ドキュメント 50件',
      'カスタムAPIキー対応',
    ],
  },
  max: {
    name: 'Max',
    price: 14800,
    description: 'ヘビーユーザー向け',
    features: [
      '音声認識（STT） 3,000分 / 月',
      'AIトークン 5,000,000 / 月',
      'ドキュメント 200件',
      '優先サポート',
    ],
  },
}

type CheckoutState = 'idle' | 'authenticating' | 'creating-checkout' | 'error'

function CheckoutContent() {
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan') || ''
  const sessionId = searchParams.get('session_id')
  const authError = searchParams.get('auth_error')

  const [state, setState] = useState<CheckoutState>(
    sessionId ? 'authenticating' : authError ? 'error' : 'idle'
  )
  const [error, setError] = useState<string | null>(authError || null)

  const planInfo = PLAN_INFO[plan]
  const priceId = getPriceIdForPlan(plan)

  // session_id がURLにある場合: ポーリング → JWT取得 → Stripe Checkout 作成
  useEffect(() => {
    if (!sessionId || !planInfo || !priceId) return

    let cancelled = false

    async function completeCheckout() {
      try {
        setState('authenticating')

        // リトライループ: DBの更新がリダイレクトに追いつくまで待機
        const maxAttempts = 5
        const pollInterval = 1000

        let token: string | undefined

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (cancelled) return

          const result = await pollAuthSession(sessionId!)

          if (result.status === 'completed' && result.token) {
            token = result.token
            break
          }

          if (result.status === 'error') {
            setError(result.error || '認証に失敗しました')
            setState('error')
            return
          }

          if (result.status === 'expired') {
            setError('セッションが期限切れです。もう一度お試しください。')
            setState('error')
            return
          }

          // pending の場合はリトライ
          if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval))
          }
        }

        if (!token) {
          setError('認証がタイムアウトしました。もう一度お試しください。')
          setState('error')
          return
        }

        if (cancelled) return

        // URLからsession_idをクリーンアップ
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}?plan=${plan}`
        )

        setState('creating-checkout')
        const origin = window.location.origin
        const checkout = await createStripeCheckout(
          token,
          priceId!,
          `${origin}/checkout/success`,
          `${origin}/checkout/cancel?plan=${plan}`
        )

        if (cancelled) return

        window.location.href = checkout.url
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : '予期しないエラーが発生しました'
          )
          setState('error')
        }
      }
    }

    completeCheckout()
    return () => {
      cancelled = true
    }
  }, [sessionId, plan, planInfo, priceId])

  // Googleログインボタン
  const handleGoogleLogin = useCallback(async () => {
    if (!planInfo || !priceId) return

    try {
      setState('authenticating')
      setError(null)
      const currentUrl = `${window.location.origin}/checkout?plan=${plan}`
      const session = await createAuthSession(currentUrl)
      window.location.href = session.authUrl
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '認証の開始に失敗しました'
      )
      setState('error')
    }
  }, [plan, planInfo, priceId])

  // 無効なプラン
  if (!planInfo || !priceId) {
    return (
      <div className="min-h-screen flex items-center justify-center pt-20 pb-12">
        <div className="text-center px-4">
          <h2 className="text-2xl font-bold text-content mb-4">
            無効なプランです
          </h2>
          <p className="text-content-secondary mb-6">
            有効なプランを選択してください。
          </p>
          <Link
            href="/#pricing"
            className="text-accent hover:text-accent-hover font-medium"
          >
            料金プランに戻る
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center pt-20 pb-12">
      <div className="max-w-md w-full mx-auto px-4">
        {/* プラン概要カード */}
        <div className="p-6 rounded-2xl border border-border bg-surface shadow-elevated mb-6">
          <div className="text-center">
            <h2 className="text-xl font-bold text-content">
              {planInfo.name} プラン
            </h2>
            <p className="text-content-secondary text-sm mt-1">
              {planInfo.description}
            </p>
            <div className="mt-4">
              <span className="text-3xl font-bold text-content">
                &yen;{planInfo.price.toLocaleString()}
              </span>
              <span className="text-content-secondary text-sm"> / 月</span>
            </div>
          </div>

          <ul className="mt-5 space-y-2.5">
            {planInfo.features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-2.5 text-sm text-content-secondary"
              >
                <svg
                  className="w-4 h-4 text-success flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {/* アクションエリア */}
        {state === 'idle' && (
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl bg-surface border border-border text-content font-medium hover:bg-surface-hover transition-colors shadow-card cursor-pointer"
          >
            <GoogleIcon />
            Googleアカウントで続ける
          </button>
        )}

        {(state === 'authenticating' || state === 'creating-checkout') && (
          <div className="text-center py-8">
            <Spinner />
            <p className="mt-4 text-content-secondary text-sm">
              {state === 'authenticating'
                ? '認証を処理中...'
                : '決済ページを準備中...'}
            </p>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center">
            <div className="p-4 rounded-xl bg-error/5 border border-error/20 text-error text-sm mb-4">
              {error}
            </div>
            <button
              onClick={() => {
                setState('idle')
                setError(null)
              }}
              className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors cursor-pointer"
            >
              もう一度試す
            </button>
          </div>
        )}

        {/* 戻るリンク */}
        <div className="mt-6 text-center">
          <Link
            href="/#pricing"
            className="text-sm text-content-tertiary hover:text-content-secondary transition-colors"
          >
            料金プランに戻る
          </Link>
        </div>

        {/* 補足 */}
        <p className="mt-4 text-center text-xs text-content-tertiary leading-relaxed">
          決済はStripeで安全に処理されます。
          <br />
          いつでもアプリ内から解約できます。
        </p>
      </div>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center pt-20">
          <Spinner />
        </div>
      }
    >
      <CheckoutContent />
    </Suspense>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function Spinner() {
  return (
    <div className="inline-block w-8 h-8 border-3 border-accent/20 border-t-accent rounded-full animate-spin" />
  )
}
