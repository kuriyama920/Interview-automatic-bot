/**
 * トースト通知コンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

import { useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastData {
  id: string
  type: ToastType
  message: string
  duration?: number
}

interface ToastProps {
  toast: ToastData
  onClose: (id: string) => void
}

// アイコン定義
const toastIcons: Record<ToastType, JSX.Element> = {
  success: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
}

// スタイル定義（Linear Design）
const toastStyles: Record<
  ToastType,
  { bg: string; border: string; icon: string; text: string }
> = {
  success: {
    bg: 'bg-success-subtle',
    border: 'border-success/20',
    icon: 'text-success',
    text: 'text-success-text',
  },
  error: {
    bg: 'bg-error-subtle',
    border: 'border-error/20',
    icon: 'text-error',
    text: 'text-error-text',
  },
  warning: {
    bg: 'bg-warning-subtle',
    border: 'border-warning/20',
    icon: 'text-warning',
    text: 'text-warning-text',
  },
  info: {
    bg: 'bg-info-subtle',
    border: 'border-info/20',
    icon: 'text-info',
    text: 'text-info-text',
  },
}

// 閉じるアイコン
const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

function Toast({ toast, onClose }: ToastProps) {
  const { id, type, message, duration = 4000 } = toast
  const styles = toastStyles[type]

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose(id)
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3
        ${styles.bg} ${styles.border}
        border rounded-xl shadow-card
        backdrop-blur-sm
        animate-slide-up
      `}
      role="alert"
    >
      <span className={`shrink-0 ${styles.icon}`}>{toastIcons[type]}</span>
      <span className={`flex-1 text-sm font-medium ${styles.text}`}>{message}</span>
      <button
        className={`
          shrink-0 p-1 rounded-lg
          ${styles.icon} hover:bg-black/5
          transition-colors
        `}
        onClick={() => onClose(id)}
        aria-label="閉じる"
      >
        <CloseIcon />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: ToastData[]
  onClose: (id: string) => void
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  )
}
