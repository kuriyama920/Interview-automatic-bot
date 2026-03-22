import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Env } from '../../src/types'

// Mock all external dependencies
vi.mock('../../src/lib/supabase', () => ({
  createSupabaseAdmin: vi.fn(),
}))

const TEST_ENV = {
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  JWT_SECRET: 'test-jwt-secret-key-for-testing-purposes-only',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-supabase-key',
  OPENAI_API_KEY: 'test-openai-key',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  CRON_SECRET: 'test-cron-secret',
  SONIOX_API_KEY: 'test-soniox-key',
} satisfies Env

describe('App entry point', () => {
  it('exports fetch and scheduled handlers', async () => {
    const mod = await import('../../src/index')
    expect(mod.default).toBeDefined()
    expect(typeof mod.default.fetch).toBe('function')
    expect(typeof mod.default.scheduled).toBe('function')
  }, 15000)
})

describe('Health check', () => {
  it('returns ok status on /health', async () => {
    const { Hono } = await import('hono')
    const mod = await import('../../src/index')

    // We test via the Hono app's fetch directly
    const req = new Request('http://localhost/health')
    const res = await mod.default.fetch(req, TEST_ENV, {} as ExecutionContext)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
  })
})

describe('404 fallback', () => {
  it('returns 404 for unknown routes', async () => {
    const mod = await import('../../src/index')

    const req = new Request('http://localhost/unknown/path')
    const res = await mod.default.fetch(req, TEST_ENV, {} as ExecutionContext)

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Not found')
  })
})

describe('CORS on /api/*', () => {
  it('responds with CORS headers for API routes', async () => {
    const mod = await import('../../src/index')

    const req = new Request('http://localhost/api/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://interview-bot-web.pages.dev',
        'Access-Control-Request-Method': 'POST',
      },
    })
    const res = await mod.default.fetch(req, TEST_ENV, {} as ExecutionContext)

    expect(res.headers.get('access-control-allow-origin')).toBe('https://interview-bot-web.pages.dev')
  })
})
