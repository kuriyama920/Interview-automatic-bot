'use client'

import { useState, useCallback, useEffect } from 'react'
import { createAuthSession } from '@/lib/api'

interface SignupModalProps {
  isOpen: boolean
  onClose: () => void
  selectedPlan: { id: string; name: string; price: number } | null
}

type ModalState = 'idle' | 'loading' | 'error'

export function SignupModal({ isOpen, onClose, selectedPlan }: SignupModalProps) {
  const [state, setState] = useState<ModalState>('idle')
  const [error, setError] = useState<string | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setState('idle')
      setError(null)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  const handleGoogleSignup = useCallback(async () => {
    try {
      setState('loading')
      setError(null)

      // 有料プラン: 認証後にcheckoutページでStripe決済へ
      // 無料プラン/未選択: ダウンロードページへ
      const isPaidPlan = selectedPlan && selectedPlan.price > 0
      const returnUrl = isPaidPlan
        ? `${window.location.origin}/checkout?plan=${encodeURIComponent(selectedPlan.id)}`
        : `${window.location.origin}/download`

      const session = await createAuthSession(returnUrl)
      window.location.href = session.authUrl
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '認証の開始に失敗しました'
      )
      setState('error')
    }
  }, [selectedPlan])

  if (!isOpen) return null

  const planLabel = selectedPlan && selectedPlan.price > 0
    ? `${selectedPlan.name}プラン`
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl bg-surface border border-border shadow-modal animate-slide-up overflow-hidden">
        {/* Accent top bar */}
        <div className="h-1 bg-gradient-to-r from-accent via-accent-hover to-accent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-lg flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-tertiary transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="px-7 pt-7 pb-6">
          {/* Icon */}
          <div className="flex justify-center mb-5">
            <div className="w-14 h-14 rounded-xl bg-accent-subtle flex items-center justify-center border border-accent/15">
              <svg className="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <div className="text-center">
            <h2 className="text-xl font-bold text-content">
              アカウント作成
            </h2>
            <p className="mt-1.5 text-sm text-content-secondary">
              {planLabel
                ? <>{planLabel}を始めましょう</>
                : 'まずは無料でお試しください'}
            </p>
          </div>

          {/* Plan badge */}
          {planLabel && (
            <div className="mt-4 flex justify-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-subtle text-accent border border-accent/15">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {planLabel}
              </span>
            </div>
          )}

          {/* Google signup button */}
          <div className="mt-6">
            {state === 'loading' ? (
              <div className="flex items-center justify-center gap-3 py-3 rounded-xl bg-surface-tertiary text-content font-medium text-sm">
                <div className="w-4 h-4 border-2 border-content/20 border-t-accent rounded-full animate-spin" />
                認証を処理中...
              </div>
            ) : (
              <button
                onClick={handleGoogleSignup}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-surface text-content font-medium text-sm border border-border hover:bg-surface-secondary transition-colors shadow-soft cursor-pointer"
              >
                <GoogleIcon />
                Googleで登録
              </button>
            )}

            {state === 'error' && error && (
              <div className="mt-3 p-3 rounded-lg bg-error-subtle border border-error/20 text-error-text text-sm text-center">
                {error}
              </div>
            )}
          </div>

          {/* Terms */}
          <p className="mt-4 text-center text-[11px] text-content-tertiary leading-relaxed">
            アカウント作成により、
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-content-secondary underline underline-offset-2 hover:text-content">利用規約</a>
            と
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-content-secondary underline underline-offset-2 hover:text-content">プライバシーポリシー</a>
            に同意したものとみなされます
          </p>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
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
