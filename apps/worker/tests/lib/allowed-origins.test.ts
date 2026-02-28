import { describe, it, expect } from 'vitest'
import { isAllowedOrigin, ALLOWED_ORIGINS } from '../../src/lib/allowed-origins'

describe('ALLOWED_ORIGINS', () => {
  it('includes production domains', () => {
    expect(ALLOWED_ORIGINS).toContain('https://interviewbot.app')
    expect(ALLOWED_ORIGINS).toContain('https://www.interviewbot.app')
  })

  it('includes development domains', () => {
    expect(ALLOWED_ORIGINS).toContain('http://localhost:3000')
    expect(ALLOWED_ORIGINS).toContain('http://localhost:5173')
  })
})

describe('isAllowedOrigin', () => {
  it('allows explicit production origins', () => {
    expect(isAllowedOrigin('https://interviewbot.app')).toBe(true)
    expect(isAllowedOrigin('https://www.interviewbot.app')).toBe(true)
  })

  it('allows production origins with paths', () => {
    expect(isAllowedOrigin('https://interviewbot.app/checkout')).toBe(true)
    expect(isAllowedOrigin('https://interviewbot.app/auth/callback?code=123')).toBe(true)
  })

  it('allows localhost for development', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173/some-path')).toBe(true)
  })

  it('allows Cloudflare Pages preview deployments', () => {
    expect(isAllowedOrigin('https://abc123.interview-bot.pages.dev')).toBe(true)
    expect(isAllowedOrigin('https://preview-xyz.interview-bot.pages.dev')).toBe(true)
    expect(isAllowedOrigin('https://feature-branch.interview-bot-dashboard.pages.dev')).toBe(true)
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
    expect(isAllowedOrigin('https://interviewbot.app.evil.com')).toBe(false)
    expect(isAllowedOrigin('https://fakeinterviewbot.app')).toBe(false)
  })
})
