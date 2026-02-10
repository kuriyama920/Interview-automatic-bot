/**
 * 認証ユーティリティのテスト
 * JWT 生成・検証・リクエストからの抽出
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// 環境変数を設定（モジュールロード前に必要）
vi.stubEnv('JWT_SECRET', 'test-jwt-secret')
vi.stubEnv('GOOGLE_CLIENT_ID', 'test-google-client-id')
vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-google-client-secret')

import { generateJWT, verifyJWT, getUserFromRequest } from '../../apps/api/lib/auth'
import { createMockRequest } from './helpers'

describe('Auth Library', () => {
  describe('generateJWT', () => {
    it('should generate a valid JWT token', () => {
      const token = generateJWT({
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/pic.jpg',
      })

      expect(token).toBeTruthy()
      expect(token.split('.')).toHaveLength(3)
    })

    it('should create a token that can be verified', () => {
      const token = generateJWT({
        sub: 'user-456',
        email: 'user@example.com',
        name: 'User',
        picture: '',
      })

      const payload = verifyJWT(token)
      expect(payload).not.toBeNull()
      expect(payload!.sub).toBe('user-456')
      expect(payload!.email).toBe('user@example.com')
    })
  })

  describe('verifyJWT', () => {
    it('should verify a valid token', () => {
      const token = generateJWT({
        sub: 'user-789',
        email: 'verify@example.com',
        name: 'Verify User',
        picture: '',
      })

      const payload = verifyJWT(token)
      expect(payload).not.toBeNull()
      expect(payload!.sub).toBe('user-789')
      expect(payload!.iat).toBeDefined()
      expect(payload!.exp).toBeDefined()
    })

    it('should return null for invalid token', () => {
      const result = verifyJWT('invalid.token.here')
      expect(result).toBeNull()
    })

    it('should return null for expired token', () => {
      // 手動で期限切れトークンを作成
      const crypto = require('crypto')
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
      const payload = Buffer.from(JSON.stringify({
        sub: 'user',
        email: 'e',
        name: 'n',
        picture: '',
        iat: 1000000,
        exp: 1000001, // 過去の時刻
      })).toString('base64url')
      const sig = crypto
        .createHmac('sha256', 'test-jwt-secret')
        .update(`${header}.${payload}`)
        .digest('base64url')

      const result = verifyJWT(`${header}.${payload}.${sig}`)
      expect(result).toBeNull()
    })

    it('should return null for tampered signature', () => {
      const token = generateJWT({
        sub: 'user',
        email: 'e@e.com',
        name: 'n',
        picture: '',
      })

      const parts = token.split('.')
      parts[2] = 'tampered-signature'
      const result = verifyJWT(parts.join('.'))
      expect(result).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(verifyJWT('')).toBeNull()
    })
  })

  describe('getUserFromRequest', () => {
    it('should extract user from valid Authorization header', () => {
      const token = generateJWT({
        sub: 'req-user',
        email: 'req@example.com',
        name: 'Req User',
        picture: '',
      })

      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` },
      })

      const payload = getUserFromRequest(req)
      expect(payload).not.toBeNull()
      expect(payload!.sub).toBe('req-user')
    })

    it('should return null without Authorization header', () => {
      const req = createMockRequest({ headers: {} })
      expect(getUserFromRequest(req)).toBeNull()
    })

    it('should return null with non-Bearer scheme', () => {
      const req = createMockRequest({
        headers: { authorization: 'Basic abc123' },
      })
      expect(getUserFromRequest(req)).toBeNull()
    })

    it('should return null with invalid token', () => {
      const req = createMockRequest({
        headers: { authorization: 'Bearer invalid-token' },
      })
      expect(getUserFromRequest(req)).toBeNull()
    })
  })
})
