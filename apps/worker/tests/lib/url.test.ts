import { describe, it, expect } from 'vitest'
import { getBaseUrl } from '../../src/lib/url'

describe('getBaseUrl', () => {
  it('extracts base URL from HTTPS request', () => {
    const req = new Request('https://interview-bot-api.interviewautomaticbot92.workers.dev/api/auth/callback?code=123')
    expect(getBaseUrl(req)).toBe('https://interview-bot-api.interviewautomaticbot92.workers.dev')
  })

  it('extracts base URL from HTTP localhost request', () => {
    const req = new Request('http://localhost:8787/api/health')
    expect(getBaseUrl(req)).toBe('http://localhost:8787')
  })

  it('handles URL with port', () => {
    const req = new Request('https://example.com:3000/path')
    expect(getBaseUrl(req)).toBe('https://example.com:3000')
  })

  it('strips path and query string', () => {
    const req = new Request('https://api.example.com/api/v1/users?page=1&limit=10')
    expect(getBaseUrl(req)).toBe('https://api.example.com')
  })

  it('strips fragment', () => {
    const req = new Request('https://example.com/page#section')
    expect(getBaseUrl(req)).toBe('https://example.com')
  })
})
