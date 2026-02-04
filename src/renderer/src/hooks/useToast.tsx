/**
 * トースト通知用カスタムフックとコンテキスト
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { ToastContainer, ToastData, ToastType } from '../components/Toast'

interface ToastContextValue {
  showToast: (type: ToastType, message: string, duration?: number) => void
  success: (message: string) => void
  error: (message: string) => void
  warning: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let toastIdCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = `toast-${++toastIdCounter}`
      const newToast: ToastData = { id, type, message, duration }

      setToasts((prev) => {
        // 最大5件まで表示
        const updated = [...prev, newToast]
        if (updated.length > 5) {
          return updated.slice(-5)
        }
        return updated
      })
    },
    []
  )

  const success = useCallback(
    (message: string) => showToast('success', message),
    [showToast]
  )

  const error = useCallback(
    (message: string) => showToast('error', message, 6000),
    [showToast]
  )

  const warning = useCallback(
    (message: string) => showToast('warning', message, 5000),
    [showToast]
  )

  const info = useCallback(
    (message: string) => showToast('info', message),
    [showToast]
  )

  const value: ToastContextValue = {
    showToast,
    success,
    error,
    warning,
    info,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
