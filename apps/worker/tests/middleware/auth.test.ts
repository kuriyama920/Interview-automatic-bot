import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

// Mock the auth module's verifyJWT used in middleware
vi.mock('../../src/lib/auth', async () => {
  const actual = await vi.importActual('../../src/lib/auth')
  return actual
})

// Import after mock
import { authRequired } from '../../src/middleware/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'

function createTestApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', authRequired)
  app.get('/test', (c) => {
    const payload = c.get('jwtPayload')
    return c.json({ sub: payload.sub, email: payload.email })
  })
  return app
}

describe('authRequired middleware', () => {
  it('rejects requests without Authorization header', async () => {
    const app = createTestApp()
    const res = await app.request('/test', {}, {
      JWT_SECRET: TEST_JWT_SECRET,
    } as Env)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('rejects requests with non-Bearer auth', async () => {
    const app = createTestApp()
    const res = await app.request('/test', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    }, {
      JWT_SECRET: TEST_JWT_SECRET,
    } as Env)

    expect(res.status).toBe(401)
  })

  it('rejects requests with invalid token', async () => {
    const app = createTestApp()
    const res = await app.request('/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    }, {
      JWT_SECRET: TEST_JWT_SECRET,
    } as Env)

    expect(res.status).toBe(401)
  })

  it('allows requests with valid JWT and sets payload', async () => {
    const app = createTestApp()

    const token = await generateJWT(
      {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
      },
      TEST_JWT_SECRET
    )

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    }, {
      JWT_SECRET: TEST_JWT_SECRET,
    } as Env)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sub).toBe('user-123')
    expect(body.email).toBe('test@example.com')
  })

  it('rejects expired tokens', async () => {
    const app = createTestApp()

    // Generate token with past timestamp
    const realDateNow = Date.now
    Date.now = () => new Date('2020-01-01').getTime()
    const token = await generateJWT(
      {
        sub: 'user-123',
        email: 'test@example.com',
        name: 'Test',
        picture: '',
      },
      TEST_JWT_SECRET
    )
    Date.now = realDateNow

    const res = await app.request('/test', {
      headers: { Authorization: `Bearer ${token}` },
    }, {
      JWT_SECRET: TEST_JWT_SECRET,
    } as Env)

    expect(res.status).toBe(401)
  })
})
