import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generateJWT,
  verifyJWT,
  generateGoogleAuthUrl,
  getUserFromRequest,
} from '../../src/lib/auth'
import type { Env } from '../../src/types'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

describe('JWT round-trip', () => {
  it('generates and verifies a valid JWT', async () => {
    const payload = {
      sub: '550e8400-e29b-41d4-a716-446655440000',
      email: 'test@example.com',
      name: 'Test User',
      picture: 'https://example.com/avatar.jpg',
    }

    const token = await generateJWT(payload, TEST_JWT_SECRET)
    expect(token).toBeTruthy()
    expect(token.split('.')).toHaveLength(3)

    const decoded = await verifyJWT(token, TEST_JWT_SECRET)
    expect(decoded).not.toBeNull()
    expect(decoded!.sub).toBe(payload.sub)
    expect(decoded!.email).toBe(payload.email)
    expect(decoded!.name).toBe(payload.name)
    expect(decoded!.picture).toBe(payload.picture)
    expect(decoded!.iat).toBeDefined()
    expect(decoded!.exp).toBeDefined()
    expect(decoded!.exp).toBeGreaterThan(decoded!.iat)
  })

  it('sets 7-day expiration', async () => {
    const payload = {
      sub: 'user-id',
      email: 'test@example.com',
      name: 'Test',
      picture: '',
    }

    const token = await generateJWT(payload, TEST_JWT_SECRET)
    const decoded = await verifyJWT(token, TEST_JWT_SECRET)
    expect(decoded).not.toBeNull()

    const sevenDays = 60 * 60 * 24 * 7
    expect(decoded!.exp - decoded!.iat).toBe(sevenDays)
  })

  it('rejects tampered token', async () => {
    const payload = {
      sub: 'user-id',
      email: 'test@example.com',
      name: 'Test',
      picture: '',
    }

    const token = await generateJWT(payload, TEST_JWT_SECRET)
    // Tamper with the payload portion
    const parts = token.split('.')
    parts[1] = parts[1] + 'x'
    const tamperedToken = parts.join('.')

    const result = await verifyJWT(tamperedToken, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })

  it('rejects token with wrong secret', async () => {
    const payload = {
      sub: 'user-id',
      email: 'test@example.com',
      name: 'Test',
      picture: '',
    }

    const token = await generateJWT(payload, TEST_JWT_SECRET)
    const result = await verifyJWT(token, 'wrong-secret')
    expect(result).toBeNull()
  })

  it('rejects expired token', async () => {
    const payload = {
      sub: 'user-id',
      email: 'test@example.com',
      name: 'Test',
      picture: '',
    }

    // Mock Date.now to generate an expired token
    const realDateNow = Date.now
    Date.now = () => new Date('2020-01-01').getTime()
    const token = await generateJWT(payload, TEST_JWT_SECRET)
    Date.now = realDateNow

    // Now verify with real time - should be expired
    const result = await verifyJWT(token, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyJWT('', TEST_JWT_SECRET)).toBeNull()
    expect(await verifyJWT('not-a-jwt', TEST_JWT_SECRET)).toBeNull()
    expect(await verifyJWT('a.b', TEST_JWT_SECRET)).toBeNull()
    expect(await verifyJWT('a.b.c.d', TEST_JWT_SECRET)).toBeNull()
  })
})

describe('generateGoogleAuthUrl', () => {
  const mockEnv = {
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-secret',
  } as Env

  it('generates valid Google OAuth URL', () => {
    const url = generateGoogleAuthUrl(
      'https://api.example.com/callback',
      'random-state',
      mockEnv
    )

    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url).toContain('client_id=test-client-id')
    expect(url).toContain('redirect_uri=https%3A%2F%2Fapi.example.com%2Fcallback')
    expect(url).toContain('state=random-state')
    expect(url).toContain('response_type=code')
    expect(url).toContain('scope=openid+email+profile')
    expect(url).toContain('access_type=offline')
    expect(url).toContain('prompt=consent')
  })
})

describe('getUserFromRequest', () => {
  it('returns null for missing authorization header', async () => {
    const req = new Request('https://example.com/api/test')
    const result = await getUserFromRequest(req, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })

  it('returns null for non-Bearer authorization', async () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })
    const result = await getUserFromRequest(req, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })

  it('returns payload for valid Bearer token', async () => {
    const payload = {
      sub: 'user-id',
      email: 'test@example.com',
      name: 'Test',
      picture: '',
    }
    const token = await generateJWT(payload, TEST_JWT_SECRET)

    const req = new Request('https://example.com/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await getUserFromRequest(req, TEST_JWT_SECRET)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe('user-id')
  })

  it('returns null for invalid Bearer token', async () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    const result = await getUserFromRequest(req, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })
})
