import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateJWT,
  verifyJWT,
  generateGoogleAuthUrl,
  getUserFromRequest,
} from '../../src/lib/auth'
import type { JWTPayload } from '../../src/lib/auth'
import type { Env } from '../../src/types'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

/**
 * Helper: decode JWT payload without verification
 */
function decodePayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return JSON.parse(atob(padded))
}

describe('JWTPayload type - PII removal', () => {
  it('should only contain sub, iat, exp fields (no email, name, picture)', () => {
    const payload: JWTPayload = {
      sub: 'user-123',
      iat: 1000,
      exp: 2000,
    }
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub'])
  })
})

describe('generateJWT - PII-free tokens', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('produces a token with only sub, iat, exp in payload', async () => {
    const token = await generateJWT({ sub: 'user-123' }, TEST_JWT_SECRET)

    const payload = decodePayload(token)
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sub'])
    expect(payload.sub).toBe('user-123')
  })

  it('does NOT contain email, name, or picture in the token payload', async () => {
    const token = await generateJWT({ sub: 'user-456' }, TEST_JWT_SECRET)

    const payload = decodePayload(token)
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('picture')
  })

  it('sets 24-hour expiration from current time', async () => {
    const token = await generateJWT({ sub: 'user-789' }, TEST_JWT_SECRET)

    const payload = decodePayload(token)
    const nowInSeconds = Math.floor(Date.now() / 1000)
    expect(payload.iat).toBe(nowInSeconds)
    expect(payload.exp).toBe(nowInSeconds + 60 * 60 * 24)
  })

  it('produces a valid 3-part JWT string', async () => {
    const token = await generateJWT({ sub: 'user-123' }, TEST_JWT_SECRET)

    const parts = token.split('.')
    expect(parts).toHaveLength(3)
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0)
      expect(part).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

describe('verifyJWT - PII-free verification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns payload with only sub, iat, exp for a valid token', async () => {
    const token = await generateJWT({ sub: 'user-123' }, TEST_JWT_SECRET)
    const payload = await verifyJWT(token, TEST_JWT_SECRET)

    expect(payload).not.toBeNull()
    expect(payload!.sub).toBe('user-123')
    expect(payload!.iat).toBeDefined()
    expect(payload!.exp).toBeDefined()
    expect(payload!.exp).toBeGreaterThan(payload!.iat)
    // PII fields must NOT be present
    expect(payload).not.toHaveProperty('email')
    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('picture')
  })

  it('returns null for an expired token', async () => {
    const token = await generateJWT({ sub: 'user-123' }, TEST_JWT_SECRET)

    // Advance time past 24h expiration
    vi.setSystemTime(new Date('2026-01-16T01:00:00Z'))

    const payload = await verifyJWT(token, TEST_JWT_SECRET)
    expect(payload).toBeNull()
  })

  it('returns null for an invalid signature (wrong secret)', async () => {
    const token = await generateJWT({ sub: 'user-123' }, TEST_JWT_SECRET)
    const payload = await verifyJWT(token, 'wrong-secret')
    expect(payload).toBeNull()
  })

  it('returns null for a tampered token', async () => {
    const token = await generateJWT({ sub: 'user-123' }, TEST_JWT_SECRET)
    const parts = token.split('.')
    parts[1] = parts[1] + 'x'
    const tamperedToken = parts.join('.')

    const result = await verifyJWT(tamperedToken, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })

  it('returns null for malformed tokens', async () => {
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
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

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

  it('returns payload for valid Bearer token (sub only, no PII)', async () => {
    const token = await generateJWT({ sub: 'user-id' }, TEST_JWT_SECRET)

    const req = new Request('https://example.com/api/test', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await getUserFromRequest(req, TEST_JWT_SECRET)
    expect(result).not.toBeNull()
    expect(result!.sub).toBe('user-id')
    expect(result).not.toHaveProperty('email')
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('picture')
  })

  it('returns null for invalid Bearer token', async () => {
    const req = new Request('https://example.com/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    const result = await getUserFromRequest(req, TEST_JWT_SECRET)
    expect(result).toBeNull()
  })
})
