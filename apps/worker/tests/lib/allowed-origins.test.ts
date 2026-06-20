import { describe, it, expect } from 'vitest'
import { isAllowedOrigin, ALLOWED_ORIGINS } from '../../src/lib/allowed-origins'

describe('ALLOWED_ORIGINS', () => {
  it('includes production domains', () => {
    expect(ALLOWED_ORIGINS).toContain('https://interview-bot-web.pages.dev')
  })

  it('includes development domains', () => {
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3000')
    expect(ALLOWED_ORIGINS).toContain('http://localhost:5173')
  })
})

describe('isAllowedOrigin', () => {
  it('allows explicit production origins', () => {
    expect(isAllowedOrigin('https://interview-bot-web.pages.dev')).toBe(true)
  })

  it('allows production origins with paths', () => {
    expect(isAllowedOrigin('https://interview-bot-web.pages.dev/checkout')).toBe(true)
    expect(isAllowedOrigin('https://interview-bot-web.pages.dev/auth/callback?code=123')).toBe(true)
  })

  it('allows localhost for development', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173/some-path')).toBe(true)
  })

  it('allows Cloudflare Pages preview deployments (8-char hex subdomain only)', () => {
    expect(isAllowedOrigin('https://a1b2c3d4.interview-bot-web.pages.dev')).toBe(true)
    expect(isAllowedOrigin('https://0f9e8d7c.interview-bot-web.pages.dev')).toBe(true)
    // セキュリティ強化: 8文字hex以外のサブドメイン（branch alias等）は拒否
    expect(isAllowedOrigin('https://preview-xyz.interview-bot-web.pages.dev')).toBe(false)
  })

  it('rejects unrelated Cloudflare Pages deployments', () => {
    expect(isAllowedOrigin('https://some-other-app.pages.dev')).toBe(false)
    expect(isAllowedOrigin('https://malicious-site.pages.dev')).toBe(false)
  })

  it('rejects random domains', () => {
    expect(isAllowedOrigin('https://evil.com')).toBe(false)
    expect(isAllowedOrigin('https://google.com')).toBe(false)
  })

  it('rejects invalid URLs', () => {
    expect(isAllowedOrigin('not-a-url')).toBe(false)
    expect(isAllowedOrigin('')).toBe(false)
  })

  it('rejects similar but not matching domains', () => {
    expect(isAllowedOrigin('https://interview-bot-web.pages.dev.evil.com')).toBe(false)
    expect(isAllowedOrigin('https://fakeinterview-bot-web.pages.dev')).toBe(false)
  })
})
