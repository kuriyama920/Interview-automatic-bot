import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The module under test does not exist yet - these tests should FAIL (TDD RED phase)
// Implementation should be created at: src/config/env-config.ts
import { getConfig } from '../../src/config/env-config'
import type { AppConfig } from '../../src/config/env-config'

const DEFAULT_API_BASE_URL =
  'https://interview-bot-api.interviewautomaticbot92.workers.dev'

describe('getConfig', () => {
  const originalEnv = import.meta.env

  beforeEach(() => {
    // Reset import.meta.env to a clean state before each test
    vi.stubEnv('MAIN_VITE_API_BASE_URL', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('apiBaseUrl', () => {
    it('returns the default API URL when MAIN_VITE_API_BASE_URL is not set', () => {
      vi.stubEnv('MAIN_VITE_API_BASE_URL', '')

      const config: AppConfig = getConfig()

      expect(config.apiBaseUrl).toBe(DEFAULT_API_BASE_URL)
    })

    it('returns custom API URL from MAIN_VITE_API_BASE_URL when available', () => {
      const customUrl = 'https://custom-api.example.com'
      vi.stubEnv('MAIN_VITE_API_BASE_URL', customUrl)

      const config: AppConfig = getConfig()

      expect(config.apiBaseUrl).toBe(customUrl)
    })

    it('trims whitespace from MAIN_VITE_API_BASE_URL', () => {
      vi.stubEnv('MAIN_VITE_API_BASE_URL', '  https://trimmed.example.com  ')

      const config: AppConfig = getConfig()

      expect(config.apiBaseUrl).toBe('https://trimmed.example.com')
    })

    it('falls back to default when MAIN_VITE_API_BASE_URL is undefined', () => {
      // Ensure the env var is completely absent
      vi.stubEnv('MAIN_VITE_API_BASE_URL', undefined as unknown as string)

      const config: AppConfig = getConfig()

      expect(config.apiBaseUrl).toBe(DEFAULT_API_BASE_URL)
    })
  })

  describe('build-time injection (no runtime process.env dependency)', () => {
    it('does not read from process.env.API_BASE_URL at runtime', () => {
      // The config should use import.meta.env (build-time), not process.env (runtime)
      const originalProcessEnv = process.env.API_BASE_URL
      process.env.API_BASE_URL = 'https://should-not-be-used.example.com'

      const config: AppConfig = getConfig()

      // Config should NOT pick up the process.env value
      expect(config.apiBaseUrl).not.toBe('https://should-not-be-used.example.com')
      expect(config.apiBaseUrl).toBe(DEFAULT_API_BASE_URL)

      // Restore
      if (originalProcessEnv === undefined) {
        delete process.env.API_BASE_URL
      } else {
        process.env.API_BASE_URL = originalProcessEnv
      }
    })

    it('does not require ELECTRON_STORE_ENCRYPTION_KEY', () => {
      // Ensure ELECTRON_STORE_ENCRYPTION_KEY is not set
      const originalKey = process.env.ELECTRON_STORE_ENCRYPTION_KEY
      delete process.env.ELECTRON_STORE_ENCRYPTION_KEY

      // getConfig() should succeed without throwing, even without this env var
      expect(() => getConfig()).not.toThrow()

      const config: AppConfig = getConfig()
      expect(config).toBeDefined()
      expect(config.apiBaseUrl).toBe(DEFAULT_API_BASE_URL)

      // The config interface should not expose encryption key at all
      expect(config).not.toHaveProperty('encryptionKey')
      expect(config).not.toHaveProperty('electronStoreEncryptionKey')

      // Restore
      if (originalKey !== undefined) {
        process.env.ELECTRON_STORE_ENCRYPTION_KEY = originalKey
      }
    })
  })

  describe('return type', () => {
    it('returns an object conforming to AppConfig interface', () => {
      const config: AppConfig = getConfig()

      expect(config).toEqual(
        expect.objectContaining({
          apiBaseUrl: expect.any(String),
        })
      )
    })

    it('returns a new object on each call (immutability)', () => {
      const config1 = getConfig()
      const config2 = getConfig()

      expect(config1).toEqual(config2)
      expect(config1).not.toBe(config2)
    })
  })
})
