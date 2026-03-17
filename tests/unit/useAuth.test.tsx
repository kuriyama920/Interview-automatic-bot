import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from '../../src/renderer/src/hooks/useAuth'

// Get reference to mocked electron API
const mockElectronAuth = window.electron.auth

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockElectronAuth.validate as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      state: { isAuthenticated: false, isLoading: false, user: null, error: null },
    })
    ;(mockElectronAuth.onStateChanged as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn())
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  )

  describe('context requirement', () => {
    it('should throw error when used outside AuthProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useAuth())
      }).toThrow('useAuth must be used within an AuthProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('initial state', () => {
    it('should start with loading state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      // Initially isLoading is true (DEFAULT_AUTH_STATE)
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should validate session on mount', async () => {
      renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(mockElectronAuth.validate).toHaveBeenCalledTimes(1)
      })
    })

    it('should set up onStateChanged listener on mount', () => {
      renderHook(() => useAuth(), { wrapper })

      expect(mockElectronAuth.onStateChanged).toHaveBeenCalledTimes(1)
      expect(mockElectronAuth.onStateChanged).toHaveBeenCalledWith(expect.any(Function))
    })

    it('should clean up onStateChanged listener on unmount', () => {
      const cleanup = vi.fn()
      ;(mockElectronAuth.onStateChanged as ReturnType<typeof vi.fn>).mockReturnValue(cleanup)

      const { unmount } = renderHook(() => useAuth(), { wrapper })

      unmount()

      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe('initialization with authenticated user', () => {
    const mockUser: User = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      picture: null,
      subscriptionTier: 'free',
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: null,
      usage: { sttMinutes: 0, aiTokens: 0, storageBytes: 0 },
      interviewProfile: null,
    }

    it('should set authenticated state after validation', async () => {
      ;(mockElectronAuth.validate as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        state: { isAuthenticated: true, isLoading: false, user: mockUser, error: null },
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isAuthenticated).toBe(true)
        expect(result.current.isLoading).toBe(false)
        expect(result.current.user).toEqual(mockUser)
      })
    })
  })

  describe('initialization failure', () => {
    it('should set not loading when validation returns unsuccessful', async () => {
      ;(mockElectronAuth.validate as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.isAuthenticated).toBe(false)
      })
    })

    it('should handle validation throwing an error', async () => {
      ;(mockElectronAuth.validate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Network error')
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
        expect(result.current.error).toBe('Error: Network error')
      })
    })
  })

  describe('loginWithGoogle', () => {
    it('should call electron loginWithGoogle', async () => {
      ;(mockElectronAuth.loginWithGoogle as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.loginWithGoogle()
      })

      expect(mockElectronAuth.loginWithGoogle).toHaveBeenCalledTimes(1)
    })

    it('should set loading state during login', async () => {
      let resolveLogin: (value: { success: boolean }) => void
      ;(mockElectronAuth.loginWithGoogle as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise((resolve) => { resolveLogin = resolve })
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      let loginPromise: Promise<void>
      act(() => {
        loginPromise = result.current.loginWithGoogle()
      })

      expect(result.current.isLoading).toBe(true)
      expect(result.current.error).toBeNull()

      await act(async () => {
        resolveLogin!({ success: true })
        await loginPromise!
      })
    })

    it('should set error when login fails', async () => {
      ;(mockElectronAuth.loginWithGoogle as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: 'OAuth failed',
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.loginWithGoogle()
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('OAuth failed')
    })

    it('should set default error message when no error provided', async () => {
      ;(mockElectronAuth.loginWithGoogle as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.loginWithGoogle()
      })

      expect(result.current.error).toBe('ログインに失敗しました')
    })

    it('should handle login throwing an error', async () => {
      ;(mockElectronAuth.loginWithGoogle as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Unexpected error')
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.loginWithGoogle()
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe('Error: Unexpected error')
    })
  })

  describe('logout', () => {
    it('should call electron logout and update state', async () => {
      const loggedOutState: AuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
      }
      ;(mockElectronAuth.logout as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        state: loggedOutState,
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(mockElectronAuth.logout).toHaveBeenCalledTimes(1)
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.user).toBeNull()
    })

    it('should handle logout throwing an error', async () => {
      ;(mockElectronAuth.logout as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Logout failed')
      )

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      await act(async () => {
        await result.current.logout()
      })

      expect(result.current.error).toBe('Error: Logout failed')
    })
  })

  describe('validateSession', () => {
    it('should update state after successful validation', async () => {
      const mockUser: User = {
        id: 'user-2',
        email: 'validate@example.com',
        name: 'Validated User',
        picture: null,
        subscriptionTier: 'pro',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: '2026-12-31',
        usage: { sttMinutes: 10, aiTokens: 5000, storageBytes: 1024 },
        interviewProfile: null,
      }

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      ;(mockElectronAuth.validate as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        state: { isAuthenticated: true, isLoading: false, user: mockUser, error: null },
      })

      await act(async () => {
        await result.current.validateSession()
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user).toEqual(mockUser)
    })

    it('should handle validateSession throwing an error', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      ;(mockElectronAuth.validate as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Session expired')
      )

      await act(async () => {
        await result.current.validateSession()
      })

      expect(result.current.error).toBe('Error: Session expired')
    })
  })

  describe('onStateChanged listener', () => {
    it('should update state when onStateChanged fires', async () => {
      let stateChangedCallback: ((state: AuthState) => void) | null = null
      ;(mockElectronAuth.onStateChanged as ReturnType<typeof vi.fn>).mockImplementation(
        (callback: (state: AuthState) => void) => {
          stateChangedCallback = callback
          return vi.fn()
        }
      )

      const mockUser: User = {
        id: 'user-3',
        email: 'callback@example.com',
        name: 'Callback User',
        picture: 'https://example.com/pic.jpg',
        subscriptionTier: 'max',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: null,
        usage: { sttMinutes: 0, aiTokens: 0, storageBytes: 0 },
        interviewProfile: null,
      }

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      act(() => {
        stateChangedCallback!({
          isAuthenticated: true,
          isLoading: false,
          user: mockUser,
          error: null,
        })
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user).toEqual(mockUser)
    })
  })
})
