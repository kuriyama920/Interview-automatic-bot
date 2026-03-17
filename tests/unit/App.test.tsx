import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseAuth = vi.fn()

vi.mock('../../src/renderer/src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../src/renderer/src/hooks/useToast', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../src/renderer/src/contexts/NavigationContext', () => ({
  NavigationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../src/renderer/src/components/layout/TitleBar', () => ({
  TitleBar: () => <div data-testid="title-bar">TitleBar</div>,
}))

vi.mock('../../src/renderer/src/components/layout/AppShell', () => ({
  AppShell: () => <div data-testid="app-shell">AppShell</div>,
}))

vi.mock('../../src/renderer/src/components/LoginPage', () => ({
  LoginPage: ({ error }: { error?: string }) => (
    <div data-testid="login-page">{error && <span>{error}</span>}</div>
  ),
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  Spinner: ({ size }: { size?: string }) => <div data-testid="spinner">Loading</div>,
}))

import App from '../../src/renderer/src/App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show loading spinner while authenticating', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      error: null,
      loginWithGoogle: vi.fn(),
    })

    render(<App />)
    expect(screen.getByText('認証状態を確認中...')).toBeDefined()
  })

  it('should show LoginPage when not authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      error: null,
      loginWithGoogle: vi.fn(),
    })

    render(<App />)
    expect(screen.getByTestId('login-page')).toBeDefined()
  })

  it('should show AppShell when authenticated', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      error: null,
      loginWithGoogle: vi.fn(),
    })

    render(<App />)
    expect(screen.getByTestId('app-shell')).toBeDefined()
  })

  it('should show LoginPage with error when auth error occurs', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      error: '認証エラー',
      loginWithGoogle: vi.fn(),
    })

    render(<App />)
    expect(screen.getByTestId('login-page')).toBeDefined()
    expect(screen.getByText('認証エラー')).toBeDefined()
  })

  it('should always render TitleBar', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      error: null,
      loginWithGoogle: vi.fn(),
    })

    render(<App />)
    expect(screen.getByTestId('title-bar')).toBeDefined()
  })
})
