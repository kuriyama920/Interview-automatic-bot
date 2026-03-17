import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'

const { mockStoreGet, mockStoreSet, mockStoreDelete, MockStore } = vi.hoisted(() => {
  const mockStoreGet = vi.fn()
  const mockStoreSet = vi.fn()
  const mockStoreDelete = vi.fn()
  const MockStore = vi.fn(() => ({
    get: mockStoreGet,
    set: mockStoreSet,
    delete: mockStoreDelete,
  }))
  return { mockStoreGet, mockStoreSet, mockStoreDelete, MockStore }
})

vi.mock('electron-store', () => ({ default: MockStore }))

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

vi.mock('../../src/services/logger.service', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

// Set required env var before import
process.env.ELECTRON_STORE_ENCRYPTION_KEY = 'test-encryption-key'

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
    mockStoreGet.mockReturnValue(null)
  })

  describe('getAuthState', () => {
    it('should return unauthenticated when no tokens', () => {
      mockStoreGet.mockReturnValue(null)
      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(false)
      expect(state.user).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should return authenticated when valid tokens and user exist', () => {
      const futureExp = Date.now() + 60 * 60 * 1000 // 1 hour from now
      const tokens = { accessToken: 'valid-token', expiresAt: futureExp }
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }

      mockStoreGet
        .mockReturnValueOnce(tokens)
        .mockReturnValueOnce(user)

      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(true)
      expect(state.user).toEqual(user)
    })

    it('should return unauthenticated when token is expired', () => {
      const pastExp = Date.now() - 1000 // already expired
      const tokens = { accessToken: 'expired-token', expiresAt: pastExp }
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }

      mockStoreGet
        .mockReturnValueOnce(tokens)
        .mockReturnValueOnce(user)

      const state = authService.getAuthState()
      expect(state.isAuthenticated).toBe(false)
    })
  })

  describe('getAccessToken', () => {
    it('should return null when no tokens', () => {
      mockStoreGet.mockReturnValue(null)
      expect(authService.getAccessToken()).toBeNull()
    })

    it('should return null when token is expired', () => {
      const pastExp = Date.now() - 1000
      mockStoreGet.mockReturnValue({ accessToken: 'expired', expiresAt: pastExp })
      expect(authService.getAccessToken()).toBeNull()
    })

    it('should return token when valid', () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockStoreGet.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })
      expect(authService.getAccessToken()).toBe('valid-token')
    })
  })

  describe('logout', () => {
    it('should clear store and return unauthenticated state', () => {
      const state = authService.logout()
      expect(mockStoreDelete).toHaveBeenCalledWith('tokens')
      expect(mockStoreDelete).toHaveBeenCalledWith('user')
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

      // Trigger logout to test listener is called
      authService.logout()
      expect(listener).toHaveBeenCalled()

      // Unsubscribe and verify listener is no longer called
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

    it('should handle missing token in callback URL', async () => {
      const url = 'interview-bot://auth/callback'
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toBe('トークンが見つかりませんでした')
    })

    it('should handle invalid JWT token format', async () => {
      const url = 'interview-bot://auth/callback?token=invalid-jwt'
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(false)
      expect(state.error).toContain('トークンのデコードに失敗')
    })

    it('should process valid JWT token and fetch user info', async () => {
      // Create a valid JWT-like token (3 base64url parts)
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
      const payload = btoa(JSON.stringify({
        sub: 'user-1',
        email: 'test@example.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }))
      const signature = 'fake-signature'
      const token = `${header}.${payload}.${signature}`

      const userInfo = {
        success: true,
        user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
      }
      mockNetFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(userInfo),
      })

      const url = `interview-bot://auth/callback?token=${token}`
      const state = await authService.handleAuthCallback(url)

      expect(state.isAuthenticated).toBe(true)
      expect(state.user?.email).toBe('test@example.com')
    })
  })

  describe('authenticatedFetch', () => {
    it('should throw when no access token', async () => {
      mockStoreGet.mockReturnValue(null)
      await expect(authService.authenticatedFetch('/api/test')).rejects.toThrow('認証されていません')
    })

    it('should add Authorization header when token is valid', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      mockStoreGet.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })
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
      mockStoreGet.mockReturnValue(null)
      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(false)
    })

    it('should logout when token is expired', async () => {
      const pastExp = Date.now() - 1000
      mockStoreGet.mockReturnValue({ accessToken: 'expired-token', expiresAt: pastExp })

      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(false)
      expect(mockStoreDelete).toHaveBeenCalled()
    })

    it('should return authenticated state when token is valid', async () => {
      const futureExp = Date.now() + 60 * 60 * 1000
      const user = { id: 'user-1', email: 'test@example.com', name: 'Test User' }
      mockStoreGet.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })

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
      mockStoreGet.mockReturnValue({ accessToken: 'valid-token', expiresAt: futureExp })

      mockNetFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })

      const state = await authService.validateAndRefresh()
      expect(state.isAuthenticated).toBe(false)
      expect(mockStoreDelete).toHaveBeenCalled()
    })
  })

  describe('initialize', () => {
    it('should warn when called again (already initialized)', () => {
      // authService is already initialized in beforeAll
      // Calling again should just warn and return
      expect(() => authService.initialize(mockMainWindow as never)).not.toThrow()
    })
  })

  describe('setMainWindow', () => {
    it('should update mainWindow', () => {
      const newWindow = { isMinimized: () => false, restore: vi.fn(), focus: vi.fn() }
      expect(() => authService.setMainWindow(newWindow as never)).not.toThrow()
    })
  })
})
