/**
 * 認証管理 (Context-based)
 *
 * 単一のAuthProviderが認証状態を管理し、
 * useAuth()はContextから共有stateを返す。
 * これにより複数コンポーネント間の状態不整合を防ぐ。
 */

import { useState, useEffect, useCallback, useContext, createContext } from 'react'

// AuthState, User, UserSettings はenv.d.tsでグローバル宣言済み

const DEFAULT_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  settings: null,
  error: null,
}

interface AuthContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  settings: UserSettings | null
  error: string | null
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  validateSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * 認証プロバイダー（アプリのルートに配置）
 * 単一のstateとIPCリスナーを管理
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>(DEFAULT_AUTH_STATE)

  // 初期化: 認証状態を検証（1回だけ）
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

  // 認証状態変更リスナー（1つだけ）
  useEffect(() => {
    const cleanup = window.electron.auth.onStateChanged((state: AuthState) => {
      setAuthState(state)
    })

    return cleanup
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

  const value: AuthContextValue = {
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
    settings: authState.settings,
    error: authState.error,
    loginWithGoogle,
    logout,
    validateSession,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * 認証状態を使用するフック
 * AuthProvider配下でのみ使用可能
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
