import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { corsMiddleware } from '../../src/middleware/cors'

function createCorsTestApp() {
  const app = new Hono()
  app.use('/api/*', corsMiddleware)
  app.get('/api/test', (c) => c.json({ ok: true }))
  app.post('/api/test', (c) => c.json({ ok: true }))
  return app
}

describe('CORS middleware', () => {
  it('allows Electron requests (no origin)', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test')
    expect(res.status).toBe(200)
    // No origin = Electron, should return '*'
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('allows explicit allowed origins', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://interviewbot.app' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://interviewbot.app')
  })

  it('allows localhost development', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  it('allows Cloudflare Pages preview deployments', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://abc123.interview-bot.pages.dev' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://abc123.interview-bot.pages.dev'
    )
  })

  it('blocks unknown origins', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://evil.com' },
    })
    expect(res.status).toBe(200)
    // CORS middleware sets null for disallowed origins
    const corsHeader = res.headers.get('access-control-allow-origin')
    // Hono cors returns the request anyway but without allow-origin
    expect(corsHeader).toBeNull()
  })

  it('handles OPTIONS preflight', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://interviewbot.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization, Content-Type',
      },
    })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toContain('POST')
    expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
  })

  it('sets max-age header on preflight', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://interviewbot.app',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(res.headers.get('access-control-max-age')).toBe('86400')
  })

  it('sets credentials header', async () => {
    const app = createCorsTestApp()
    const res = await app.request('/api/test', {
      headers: { Origin: 'https://interviewbot.app' },
    })
    expect(res.headers.get('access-control-allow-credentials')).toBe('true')
  })
})
