import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Hoisted mocks ---

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

const { mockIsEncryptionAvailable, mockEncryptString, mockDecryptString } = vi.hoisted(() => {
  const mockIsEncryptionAvailable = vi.fn().mockReturnValue(true)
  const mockEncryptString = vi.fn()
  const mockDecryptString = vi.fn()
  return { mockIsEncryptionAvailable, mockEncryptString, mockDecryptString }
})

vi.mock('electron-store', () => ({ default: MockStore }))

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString,
  },
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

// --- Import under test ---

import { tokenStorage } from '../../src/services/token-storage.service'
import type { AuthTokens, User } from '../../src/types/auth'

// --- Test data ---

const mockTokens: AuthTokens = {
  accessToken: 'eyJhbGciOiJIUzI1NiJ9.test-payload.signature',
  expiresAt: Date.now() + 60 * 60 * 1000,
}

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

describe('TokenStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEncryptionAvailable.mockReturnValue(true)
    mockStoreGet.mockReturnValue(null)
    // Re-initialize to ensure clean state for each test
    tokenStorage.initialize()
  })

  describe('initialize', () => {
    it('should create electron-store without encryptionKey', () => {
      // beforeEach already calls initialize(), check the constructor
      expect(MockStore).toHaveBeenCalled()
      const constructorArgs = MockStore.mock.calls[0]?.[0] ?? {}
      expect(constructorArgs).not.toHaveProperty('encryptionKey')
    })
  })

  describe('encryptAndStore (setTokens)', () => {
    it('should encrypt token with safeStorage and store encrypted buffer in electron-store', () => {
      const encryptedBuffer = Buffer.from('encrypted-data')
      mockEncryptString.mockReturnValue(encryptedBuffer)

      tokenStorage.setTokens(mockTokens)

      // safeStorage.encryptString should be called with the serialized tokens
      expect(mockEncryptString).toHaveBeenCalledWith(JSON.stringify(mockTokens))

      // The encrypted buffer should be stored (as base64 or similar serializable format)
      expect(mockStoreSet).toHaveBeenCalledWith(
        'tokens',
        expect.anything()
      )
    })
  })

  describe('retrieveAndDecrypt (getTokens)', () => {
    it('should retrieve from electron-store and decrypt with safeStorage', () => {
      const encryptedBuffer = Buffer.from('encrypted-data')
      const serializedTokens = JSON.stringify(mockTokens)

      // Store has encrypted data
      mockStoreGet.mockReturnValue(encryptedBuffer.toString('base64'))
      mockDecryptString.mockReturnValue(serializedTokens)

      const result = tokenStorage.getTokens()

      expect(mockStoreGet).toHaveBeenCalledWith('tokens')
      expect(mockDecryptString).toHaveBeenCalled()
      expect(result).toEqual(mockTokens)
    })

    it('should return null when no data is stored', () => {
      mockStoreGet.mockReturnValue(null)

      const result = tokenStorage.getTokens()

      expect(result).toBeNull()
    })
  })

  describe('fallback to plain storage', () => {
    it('should store tokens as plain text when safeStorage is not available', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      tokenStorage.initialize()

      tokenStorage.setTokens(mockTokens)

      // Should NOT call encryptString
      expect(mockEncryptString).not.toHaveBeenCalled()

      // Should store the tokens directly (plain JSON)
      expect(mockStoreSet).toHaveBeenCalledWith('tokens', expect.anything())
    })

    it('should retrieve plain text tokens when safeStorage is not available', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      tokenStorage.initialize()
      mockStoreGet.mockReturnValue(JSON.stringify(mockTokens))

      const result = tokenStorage.getTokens()

      // Should NOT call decryptString
      expect(mockDecryptString).not.toHaveBeenCalled()
      expect(result).toEqual(mockTokens)
    })
  })

  describe('deleteTokens', () => {
    it('should delete tokens from the store', () => {
      tokenStorage.deleteTokens()

      expect(mockStoreDelete).toHaveBeenCalledWith('tokens')
    })
  })

  describe('deleteUser', () => {
    it('should delete user from the store', () => {
      tokenStorage.deleteUser()

      expect(mockStoreDelete).toHaveBeenCalledWith('user')
    })
  })

  describe('decrypt failure clears corrupt data', () => {
    it('should delete corrupt tokens and return null when decryption fails', () => {
      mockStoreGet.mockReturnValue('corrupted-base64-data')
      mockDecryptString.mockImplementation(() => {
        throw new Error('Decryption failed')
      })

      const result = tokenStorage.getTokens()

      expect(result).toBeNull()
      expect(mockStoreDelete).toHaveBeenCalledWith('tokens')
      expect(mockLog.error).toHaveBeenCalledWith(
        'Failed to decrypt tokens, clearing corrupt data',
        expect.objectContaining({ error: expect.stringContaining('Decryption failed') }),
      )
    })

    it('should delete corrupt tokens when JSON.parse fails (plaintext mode)', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      tokenStorage.initialize()
      mockStoreGet.mockReturnValue('not-valid-json{{{')

      const result = tokenStorage.getTokens()

      expect(result).toBeNull()
      expect(mockStoreDelete).toHaveBeenCalledWith('tokens')
    })
  })

  describe('safeStorage unavailable warning', () => {
    it('should log warning when storing tokens without encryption', () => {
      mockIsEncryptionAvailable.mockReturnValue(false)
      tokenStorage.initialize()

      tokenStorage.setTokens(mockTokens)

      expect(mockLog.warn).toHaveBeenCalledWith(
        'safeStorage unavailable, storing tokens in plaintext',
      )
    })
  })

  describe('safeStorage.isEncryptionAvailable error handling', () => {
    it('should fall back to plaintext when isEncryptionAvailable throws', () => {
      mockIsEncryptionAvailable.mockImplementation(() => {
        throw new Error('safeStorage not ready')
      })

      tokenStorage.initialize()
      tokenStorage.setTokens(mockTokens)

      expect(mockLog.error).toHaveBeenCalledWith(
        'safeStorage.isEncryptionAvailable() failed, falling back to plaintext',
        expect.objectContaining({ error: expect.stringContaining('safeStorage not ready') }),
      )
      expect(mockEncryptString).not.toHaveBeenCalled()
      expect(mockStoreSet).toHaveBeenCalledWith('tokens', JSON.stringify(mockTokens))
    })
  })

  describe('User storage (no encryption needed)', () => {
    it('should store User object in electron-store', () => {
      tokenStorage.setUser(mockUser)

      expect(mockStoreSet).toHaveBeenCalledWith('user', mockUser)
      // User objects are not encrypted via safeStorage
      expect(mockEncryptString).not.toHaveBeenCalled()
    })

    it('should retrieve User object from electron-store', () => {
      mockStoreGet.mockImplementation((key: string) => {
        if (key === 'user') return mockUser
        return null
      })

      const result = tokenStorage.getUser()

      expect(mockStoreGet).toHaveBeenCalledWith('user')
      expect(result).toEqual(mockUser)
    })

    it('should return null when no user is stored', () => {
      mockStoreGet.mockReturnValue(null)

      const result = tokenStorage.getUser()

      expect(result).toBeNull()
    })
  })
})
