import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'

// We need to import after mocking
vi.mock('../../src/lib/auth', async () => {
  const actual = await vi.importActual('../../src/lib/auth')
  return actual
})

import { generateJWT } from '../../src/lib/auth'
import { createRateLimiter, resetRateLimiter } from '../../src/middleware/rate-limit'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

function createTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()

  // Simulate authRequired by setting jwtPayload
  app.use('/api/ai/*', async (c, next) => {
    const authHeader = c.req.header('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const { verifyJWT } = await import('../../src/lib/auth')
      const payload = await verifyJWT(authHeader.slice(7), TEST_JWT_SECRET)
      if (payload) {
        c.set('jwtPayload', payload)
      }
    }
    await next()
  })

  app.use('/api/ai/*', createRateLimiter({ maxRequests: 5, windowMs: 60_000 }))
  app.post('/api/ai/generate', (c) => c.json({ ok: true }))
  app.post('/api/ai/summarize', (c) => c.json({ ok: true }))
  return app
}

async function makeAuthRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  userId: string
) {
  const token = await generateJWT(
    { sub: userId, email: `${userId}@test.com`, name: 'Test', picture: '' },
    TEST_JWT_SECRET
  )
  return app.request(path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question: 'test' }),
  }, { JWT_SECRET: TEST_JWT_SECRET } as Env)
}

describe('Rate limiter middleware', () => {
  beforeEach(() => {
    resetRateLimiter()
  })

  it('allows requests under the limit', async () => {
    const app = createTestApp()
    const res = await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    expect(res.status).toBe(200)
  })

  it('returns 429 when rate limit exceeded', async () => {
    const app = createTestApp()

    // Send 5 requests (at limit)
    for (let i = 0; i < 5; i++) {
      const res = await makeAuthRequest(app, '/api/ai/generate', 'user-1')
      expect(res.status).toBe(200)
    }

    // 6th request should be rate limited
    const res = await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toContain('Rate limit')
    expect(res.headers.get('Retry-After')).toBeDefined()
  })

  it('tracks users independently', async () => {
    const app = createTestApp()

    // Exhaust user-1 limit
    for (let i = 0; i < 5; i++) {
      await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    }

    // user-2 should still be allowed
    const res = await makeAuthRequest(app, '/api/ai/generate', 'user-2')
    expect(res.status).toBe(200)
  })

  it('resets after window expires', async () => {
    vi.useFakeTimers()

    const app = createTestApp()

    // Exhaust limit
    for (let i = 0; i < 5; i++) {
      await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    }

    // Should be rate limited
    let res = await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    expect(res.status).toBe(429)

    // Advance time past window
    vi.advanceTimersByTime(61_000)

    // Should be allowed again
    res = await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    expect(res.status).toBe(200)

    vi.useRealTimers()
  })

  it('returns Retry-After header with seconds remaining', async () => {
    vi.useFakeTimers()

    const app = createTestApp()

    for (let i = 0; i < 5; i++) {
      await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    }

    const res = await makeAuthRequest(app, '/api/ai/generate', 'user-1')
    expect(res.status).toBe(429)
    const retryAfter = Number(res.headers.get('Retry-After'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)

    vi.useRealTimers()
  })

  it('allows requests without auth (no jwtPayload) to pass through', async () => {
    const app = createTestApp()
    // No auth header - rate limiter should skip (auth middleware will reject later)
    const res = await app.request('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, { JWT_SECRET: TEST_JWT_SECRET } as Env)
    expect(res.status).toBe(200)
  })
})
