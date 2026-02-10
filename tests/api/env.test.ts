/**
 * 環境変数バリデーションのテスト
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Env Library', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('validateEnv', () => {
    it('should pass when all required env vars are set', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test'
      process.env.GOOGLE_CLIENT_SECRET = 'test'
      process.env.JWT_SECRET = 'test'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
      process.env.OPENAI_API_KEY = 'test'

      const { validateEnv } = await import('../../apps/api/lib/env')
      expect(() => validateEnv()).not.toThrow()
    })

    it('should throw when required env vars are missing', async () => {
      // 全て未設定の状態
      delete process.env.GOOGLE_CLIENT_ID
      delete process.env.GOOGLE_CLIENT_SECRET
      delete process.env.JWT_SECRET
      delete process.env.SUPABASE_URL
      delete process.env.SUPABASE_SERVICE_ROLE_KEY
      delete process.env.OPENAI_API_KEY

      const { validateEnv } = await import('../../apps/api/lib/env')
      expect(() => validateEnv()).toThrow('Missing required environment variables')
    })
  })

  describe('getEnv', () => {
    it('should return env var value when set', async () => {
      process.env.JWT_SECRET = 'my-secret'
      const { getEnv } = await import('../../apps/api/lib/env')
      expect(getEnv('JWT_SECRET')).toBe('my-secret')
    })

    it('should throw when env var is not set', async () => {
      delete process.env.JWT_SECRET
      const { getEnv } = await import('../../apps/api/lib/env')
      expect(() => getEnv('JWT_SECRET')).toThrow('Environment variable JWT_SECRET is not set')
    })
  })

  describe('getEnvOrDefault', () => {
    it('should return env var value when set', async () => {
      process.env.JWT_SECRET = 'actual-secret'
      const { getEnvOrDefault } = await import('../../apps/api/lib/env')
      expect(getEnvOrDefault('JWT_SECRET', 'default')).toBe('actual-secret')
    })

    it('should return default when env var is not set', async () => {
      delete process.env.JWT_SECRET
      const { getEnvOrDefault } = await import('../../apps/api/lib/env')
      expect(getEnvOrDefault('JWT_SECRET', 'default-value')).toBe('default-value')
    })
  })
})
