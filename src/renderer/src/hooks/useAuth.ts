/**
 * 認証管理フック
 * Electron AuthServiceとの連携
 */

import { useState, useEffect, useCallback } from 'react'
import type { AuthState, User, UserSettings } from '../../../../preload/index'

const DEFAULT_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  settings: null,
  error: null,
}

interface UseAuthResult {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  settings: UserSettings | null
  error: string | null
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  validateSession: () => Promise<void>
}

export function useAuth(): UseAuthResult {
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_AUTH_STATE)

  // 初期化: 認証状態を検証
  useEffect(() => {
    const initAuth = async () => {
      try {
        const result = await window.electron.auth.validate()
        if (result.success && result.state) {
          setAuthState(result.state)
        } else {
          setAuthState({
            ...DEFAULT_AUTH_STATE,
            isLoading: false,
          })
        }
      } catch (error) {
        setAuthState({
          ...DEFAULT_AUTH_STATE,
          isLoading: false,
          error: String(error),
        })
      }
    }

    initAuth()
  }, [])

  // 認証状態変更リスナー
  useEffect(() => {
    const handleStateChanged = (state: AuthState) => {
      setAuthState(state)
    }

    window.electron.auth.onStateChanged(handleStateChanged)

    return () => {
      window.electron.auth.removeStateChangedListener()
    }
  }, [])

  // Google OAuthログイン
  const loginWithGoogle = useCallback(async () => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }))

    try {
      const result = await window.electron.auth.loginWithGoogle()
      if (!result.success) {
        setAuthState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || 'ログインに失敗しました',
        }))
      }
      // 成功時はDeep Linkコールバックで状態が更新される
    } catch (error) {
      setAuthState((prev) => ({
        ...prev,
        isLoading: false,
        error: String(error),
      }))
    }
  }, [])

  // ログアウト
  const logout = useCallback(async () => {
    try {
      const result = await window.electron.auth.logout()
      if (result.success && result.state) {
        setAuthState(result.state)
      }
    } catch (error) {
      setAuthState((prev) => ({
        ...prev,
        error: String(error),
      }))
    }
  }, [])

  // セッション検証
  const validateSession = useCallback(async () => {
    try {
      const result = await window.electron.auth.validate()
      if (result.success && result.state) {
        setAuthState(result.state)
      }
    } catch (error) {
      setAuthState((prev) => ({
        ...prev,
        error: String(error),
      }))
    }
  }, [])

  return {
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
    settings: authState.settings,
    error: authState.error,
    loginWithGoogle,
    logout,
    validateSession,
  }
}
