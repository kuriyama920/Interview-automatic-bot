import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

// --- Mock tokenStorage ---
const { mockGetTokens, mockSetTokens, mockGetUser, mockSetUser, mockDeleteTokens, mockDeleteUser, mockTokenStorageInitialize } = vi.hoisted(() => ({
  mockGetTokens: vi.fn(),
  mockSetTokens: vi.fn(),
  mockGetUser: vi.fn(),
  mockSetUser: vi.fn(),
  mockDeleteTokens: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockTokenStorageInitialize: vi.fn(),
}))

vi.mock('../../src/services/token-storage.service', () => ({
  tokenStorage: {
    initialize: mockTokenStorageInitialize,
    getTokens: mockGetTokens,
    setTokens: mockSetTokens,
    getUser: mockGetUser,
    setUser: mockSetUser,
    deleteTokens: mockDeleteTokens,
    deleteUser: mockDeleteUser,
  },
}))

// --- Mock env-config ---
vi.mock('../../src/config/env-config', () => ({
  getConfig: () => ({
    apiBaseUrl: 'https://interview-bot-api.interviewautomaticbot92.workers.dev',
  }),
}))

const { mockNetFetch } = vi.hoisted(() => ({ mockNetFetch: vi.fn() }))
const { mockOpenExternal } = vi.hoisted(() => ({ mockOpenExternal: vi.fn() }))

vi.mock('electron', () => ({
  shell: { openExternal: mockOpenExternal },
  BrowserWindow: class MockBrowserWindow {
    isMinimized() { return false }
    restore() {}
    focus() {}
  },
  net: { fetch: mockNetFetch },
}))

const mockLog = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}))

vi.mock('../../src/services/logger.service', () => ({
  createLogger: () => mockLog,
}))

import { authService } from '../../src/services/auth.service'

// authService singleton: initialize once before all tests
let initialized = false
const mockMainWindow = {
  isMinimized: () => false,
  restore: vi.fn(),
  focus: vi.fn(),
}

beforeAll(() => {
  if (!initialized) {
    authService.initialize(mockMainWindow as never)
    initialized = true
  }
})

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTokens.mockReturnValue(null)
    mockGetUser.mockReturnValue(null)
  })

  describe('getAuthState', () => {
    it('should return unauthenticated when no tokens', () => {
      mockGetTokens.mockReturnValue(null)
      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should return authenticated when valid tokens and user exist', () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      const tokens = { accessToken: 'valid-token', expiresAt: futureExp }
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }

      mockGetTokens.mockReturnValue(tokens)
      mockGetUser.mockReturnValue(user)

      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user).toEqual(user)
    })

    it('should return unauthenticated when token is expired', () => {
      const pastExp = Date.now() - 1000
      const tokens = { accessToken: 'expired-token', expiresAt: pastExp }
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }

      mockGetTokens.mockReturnValue(tokens)
      mockGetUser.mockReturnValue(user)

      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should return unauthenticated when token is within 5-minute buffer', () => {
      const nearExp = Date.now() + 4 * 60 * 1000
      const tokens = { accessToken: 'near-expiry-token', expiresAt: nearExp }
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }

      mockGetTokens.mockReturnValue(tokens)
      mockGetUser.mockReturnValue(user)

      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should return authenticated when token is beyond 5-minute buffer', () => {
      const safeExp = Date.now() + 6 * 60 * 1000
      const tokens = { accessToken: 'safe-token', expiresAt: safeExp }
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }

      mockGetTokens.mockReturnValue(tokens)
      mockGetUser.mockReturnValue(user)

      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(true)
    })
  })

  describe('getAccessToken', () => {
    it('should return null when no tokens', () => {
      mockGetTokens.mockReturnValue(null)
      expect(authService.getAccessToken()).toBeNull()
    })

    it('should return null when token is expired', () => {
      const pastExp = Date.now() - 1000
      mockGetTokens.mockReturnValue({ accessToken: 'expired', expiresAt: pastExp })
      expect(authService.getAccessToken()).toBeNull()
    })

    it('should return token when valid', () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockGetTokens.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })
      expect(authService.getAccessToken()).toBe('valid-token')
    })
  })

  describe('logout', () => {
    it('should clear store and return unauthenticated state', () => {
      const state = authService.logout()
      expect(mockDeleteTokens).toHaveBeenCalled()
      expect(mockDeleteUser).toHaveBeenCalled()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
      expect(state.error).toBeNull()
    })

    it('should notify listeners on logout', () => {
      const listener = vi.fn()
      const unsubscribe = authService.addAuthStateListener(listener)

      authService.logout()

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: false })
      )
      unsubscribe()
    })
  })

  describe('addAuthStateListener', () => {
    it('should add listener and return unsubscribe function', () => {
      const listener = vi.fn()
      const unsubscribe = authService.addAuthStateListener(listener)

      expect(typeof unsubscribe).toBe('function')

      authService.logout()
      expect(listener).toHaveBeenCalled()

      listener.mockClear()
      unsubscribe()
      authService.logout()
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('handleAuthCallback', () => {
    it('should handle error in callback URL', async () => {
      const url = 'interview-bot://auth/callback?error=access_denied'
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('access_denied')
    })

    it('should return current auth state when status=completed', async () => {
      // No tokens stored, so getAuthState returns unauthenticated
      mockGetTokens.mockReturnValue(null)
      mockGetUser.mockReturnValue(null)

      const url = 'interview-bot://auth/callback?status=completed'
      const state = await authService.handleAuthCallback(url)

      // Should delegate to getAuthState (polling handles token retrieval)
      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBeNull()
      // Should NOT try to extract or decode a token
      expect(mockSetTokens).not.toHaveBeenCalled()
    })

    it('should return authenticated state when status=completed and tokens already polled', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }
      mockGetTokens.mockReturnValue({ accessToken: 'polled-token', expiresAt: futureExp })
      mockGetUser.mockReturnValue(user)

      const url = 'interview-bot://auth/callback?status=completed'
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(true)
      expect(state.user).toEqual(user)
    })

    it('should NOT try to extract token from URL', async () => {
      // Even if a token param is present, the new implementation ignores it
      const url = 'interview-bot://auth/callback?token=some-jwt-token'
      const state = await authService.handleAuthCallback(url)

      // Should not try to decode or store the token from URL
      expect(mockSetTokens).not.toHaveBeenCalled()
      expect(mockNetFetch).not.toHaveBeenCalled()
    })

    it('should focus and restore minimized window on status=completed', async () => {
      const minimizedWindow = {
        isMinimized: () => true,
        restore: vi.fn(),
        focus: vi.fn(),
      }
      authService.setMainWindow(minimizedWindow as never)

      const url = 'interview-bot://auth/callback?status=completed'
      await authService.handleAuthCallback(url)

      expect(minimizedWindow.restore).toHaveBeenCalled()
      expect(minimizedWindow.focus).toHaveBeenCalled()

      // Restore original mock window
      authService.setMainWindow(mockMainWindow as never)
    })

    it('should handle URL without status or error gracefully', async () => {
      const url = 'interview-bot://auth/callback'
      const state = await authService.handleAuthCallback(url)

      // Should return current auth state, no error
      expect(state.error).toBeNull()
      expect(mockSetTokens).not.toHaveBeenCalled()
    })

    it('should handle malformed URL gracefully', async () => {
      const url = 'not-a-valid-url'
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(false)
      // Error state but no crash
      expect(state.error).toBeNull()
    })
  })

  describe('authenticatedFetch', () => {
    it('should throw when no access token', async () => {
      mockGetTokens.mockReturnValue(null)
      await expect(authService.authenticatedFetch('/api/test')).rejects.toThrow('認証されていません')
    })

    it('should add Authorization header when token is valid', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockGetTokens.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })
      mockNetFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      await authService.authenticatedFetch('/api/test')

      expect(mockNetFetch).toHaveBeenCalledWith('/api/test', expect.anything())
      const callArgs = mockNetFetch.mock.calls[0]
      const headers = callArgs[1].headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer valid-token')
    })
  })

  describe('validateAndRefresh', () => {
    it('should return unauthenticated state when no tokens', async () => {
      mockGetTokens.mockReturnValue(null)
      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should logout when token is expired', async () => {
      const pastExp = Date.now() - 1000
      mockGetTokens.mockReturnValue({ accessToken: 'expired-token', expiresAt: pastExp })

      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(false)
      expect(mockDeleteTokens).toHaveBeenCalled()
    })

    it('should return authenticated state when token is valid', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }
      mockGetTokens.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })

      mockNetFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, user }),
      })

      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user).toEqual(user)
    })

    it('should logout when fetchUserInfo fails during refresh', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockGetTokens.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })

      mockNetFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })

      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(false)
      expect(mockDeleteTokens).toHaveBeenCalled()
    })
  })

  describe('initialize', () => {
    it('should skip re-initialization and keep existing state', () => {
      const stateBefore = authService.getAuthState()
      authService.initialize(mockMainWindow as never)
      const stateAfter = authService.getAuthState()

      expect(stateAfter.isLoading).toBe(stateBefore.isLoading)
      expect(stateAfter.error).toBe(stateBefore.error)
    })
  })

  describe('setMainWindow', () => {
    it('should update mainWindow and use it for auth callback focus', async () => {
      const newWindow = {
        isMinimized: () => true,
        restore: vi.fn(),
        focus: vi.fn(),
      }
      authService.setMainWindow(newWindow as never)

      await authService.handleAuthCallback('interview-bot://auth/callback?status=completed')

      expect(newWindow.restore).toHaveBeenCalled()
      expect(newWindow.focus).toHaveBeenCalled()

      // Restore original mock window
      authService.setMainWindow(mockMainWindow as never)
    })
  })

  describe('notifyListeners error handling', () => {
    it('should catch errors thrown by listeners', () => {
      const throwingListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener exploded')
      })
      const normalListener = vi.fn()

      const unsub1 = authService.addAuthStateListener(throwingListener)
      const unsub2 = authService.addAuthStateListener(normalListener)

      expect(() => authService.logout()).not.toThrow()
      expect(throwingListener).toHaveBeenCalled()
      expect(normalListener).toHaveBeenCalled()

      unsub1()
      unsub2()
    })
  })

  describe('decodeJWT (sub-only)', () => {
    // Access private method for unit testing
    const decodeJWT = (token: string) =>
      (authService as unknown as { decodeJWT: (t: string) => { sub: string; exp: number } | null }).decodeJWT(token)

    it('should return { sub, exp } for valid JWT with sub and exp', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({
        sub: 'user-1',
        email: 'test@example.com',
        exp: 1700000000,
        iat: 1699990000,
      }))
      const token = `${header}.${payload}.signature`

      const result = decodeJWT(token)
      expect(result).toEqual({ sub: 'user-1', exp: 1700000000 })
      // Should NOT include email
      expect(result).not.toHaveProperty('email')
      expect(result).not.toHaveProperty('iat')
    })

    it('should return null when sub is missing', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({ exp: 1700000000 }))
      const token = `${header}.${payload}.signature`

      expect(decodeJWT(token)).toBeNull()
    })

    it('should return null when exp is missing', () => {
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({ sub: 'user-1' }))
      const token = `${header}.${payload}.signature`

      expect(decodeJWT(token)).toBeNull()
    })

    it('should return null for invalid JWT format (not 3 parts)', () => {
      expect(decodeJWT('only-two.parts')).toBeNull()
      expect(decodeJWT('single')).toBeNull()
      expect(decodeJWT('')).toBeNull()
    })

    it('should return null for malformed base64 payload', () => {
      expect(decodeJWT('header.!!!invalid!!!.signature')).toBeNull()
    })

    it('should log warning when JWT decode throws an error', () => {
      decodeJWT('header.!!!invalid!!!.signature')

      expect(mockLog.warn).toHaveBeenCalledWith(
        'JWT decode failed',
        expect.objectContaining({ error: expect.any(String) }),
      )
    })
  })

  describe('authenticatedFetch with custom options', () => {
    it('should pass through method and body', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockGetTokens.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })
      mockNetFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      await authService.authenticatedFetch('/api/data', {
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      })

      const callArgs = mockNetFetch.mock.calls[0]
      expect(callArgs[1].method).toBe('POST')
      expect(callArgs[1].body).toBe(JSON.stringify({ key: 'value' }))
      const headers = callArgs[1].headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer valid-token')
    })

    it('should merge existing headers with Authorization', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockGetTokens.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })
      mockNetFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) })

      await authService.authenticatedFetch('/api/data', {
        headers: { 'Content-Type': 'application/json' },
      })

      const callArgs = mockNetFetch.mock.calls[0]
      const headers = callArgs[1].headers as Headers
      expect(headers.get('Authorization')).toBe('Bearer valid-token')
      expect(headers.get('Content-Type')).toBe('application/json')
    })
  })

  describe('handleAuthCallback additional coverage', () => {
    it('should handle encoded error message in callback URL', async () => {
      const url = 'interview-bot://auth/callback?error=%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E6%8B%92%E5%90%A6'
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('アクセス拒否')
    })

    it('should not make any network requests on status=completed', async () => {
      const url = 'interview-bot://auth/callback?status=completed'
      await authService.handleAuthCallback(url)

      // Polling handles token retrieval, callback should not fetch anything
      expect(mockNetFetch).not.toHaveBeenCalled()
    })
  })
})
