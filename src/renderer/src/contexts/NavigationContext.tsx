/**
 * ナビゲーション Context
 * ページ遷移とサイドバー状態を管理
 */

import { createContext, useContext, useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'

export type PageId =
  | 'dashboard'
  | 'interview'
  | 'documents'
  | 'questions'
  | 'profile'
  | 'subscription'

interface NavigationState {
  currentPage: PageId
  previousPage: PageId | null
  sidebarCollapsed: boolean
  isRecording: boolean
}

interface NavigationContextValue extends NavigationState {
  navigateTo: (page: PageId) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setIsRecording: (recording: boolean) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavigationState>({
    currentPage: 'dashboard',
    previousPage: null,
    sidebarCollapsed: false,
    isRecording: false,
  })

  const navigateTo = useCallback((page: PageId) => {
    setState((prev) => ({
      ...prev,
      currentPage: page,
      previousPage: prev.currentPage,
      sidebarCollapsed: page === 'interview' ? true : prev.sidebarCollapsed,
    }))
  }, [])

  const toggleSidebar = useCallback(() => {
    setState((prev) => ({ ...prev, sidebarCollapsed: !prev.sidebarCollapsed }))
  }, [])

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, sidebarCollapsed: collapsed }))
  }, [])

  const setIsRecording = useCallback((recording: boolean) => {
    setState((prev) => ({ ...prev, isRecording: recording }))
  }, [])

  // Ctrl+1~7 ショートカットでページ切り替え
  useEffect(() => {
    const pages: PageId[] = [
      'dashboard', 'interview', 'documents', 'questions',
      'profile', 'subscription',
    ]
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 6) {
          e.preventDefault()
          navigateTo(pages[num - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [navigateTo])

  const value = useMemo<NavigationContextValue>(
    () => ({
      ...state,
      navigateTo,
      toggleSidebar,
      setSidebarCollapsed,
      setIsRecording,
    }),
    [state, navigateTo, toggleSidebar, setSidebarCollapsed, setIsRecording],
  )

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext)
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider')
  }
  return context
}
