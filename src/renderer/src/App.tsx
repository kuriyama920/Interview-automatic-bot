/**
 * メインアプリケーションコンポーネント
 * TitleBar + Providers + AuthContainer + AppShell
 */

import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import { NavigationProvider } from './contexts/NavigationContext'
import { TitleBar } from './components/layout/TitleBar'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './components/LoginPage'
import { Spinner } from './components/ui'

function AuthContainer() {
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    error: authError,
    loginWithGoogle,
  } = useAuth()

  if (isAuthLoading) {
    return (
      <div className="h-full bg-surface flex items-center justify-center" data-theme="interview-light">
        <div className="text-center space-y-4">
          <Spinner size="lg" className="text-accent mx-auto" />
          <p className="text-content-secondary">認証状態を確認中...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={loginWithGoogle} isLoading={isAuthLoading} error={authError} />
  }

  return (
    <NavigationProvider>
      <AppShell />
    </NavigationProvider>
  )
}

function App() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <ToastProvider>
          <AuthProvider>
            <AuthContainer />
          </AuthProvider>
        </ToastProvider>
      </div>
    </div>
  )
}

export default App
