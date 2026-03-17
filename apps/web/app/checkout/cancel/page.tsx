'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function CancelContent() {
  const searchParams = useSearchParams()
  const rawPlan = searchParams.get('plan') || 'pro'
  const validPlans = ['pro', 'max']
  const plan = validPlans.includes(rawPlan) ? rawPlan : 'pro'

  return (
    <div className="min-h-screen flex items-center justify-center pt-20 pb-12">
      <div className="max-w-md w-full mx-auto px-4 text-center">
        {/* キャンセルアイコン */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-warning/10 to-warning/5 border border-warning/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-content">
          決済がキャンセルされました
        </h1>
        <p className="mt-3 text-content-secondary">
          プランの変更は行われていません。いつでもアップグレードできます。
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href={`/checkout?plan=${plan}`}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent-hover transition-colors"
          >
            もう一度試す
          </Link>
          <Link
            href="/#pricing"
            className="text-sm text-content-tertiary hover:text-content-secondary transition-colors"
          >
            料金プランに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function CheckoutCancelPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <CancelContent />
    </Suspense>
  )
}
