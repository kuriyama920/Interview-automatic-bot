import { describe, it, expect } from 'vitest'
import { escapeHtml, getSuccessPageHtml, getErrorPageHtml } from '../../src/lib/auth-pages'

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a&b')).toBe('a&amp;b')
  })

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;')
  })

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s')
  })

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('does not double-escape', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;')
  })

  it('escapes all special characters together', () => {
    expect(escapeHtml('<"test" & \'value\'>')).toBe(
      '&lt;&quot;test&quot; &amp; &#039;value&#039;&gt;'
    )
  })
})

describe('getSuccessPageHtml', () => {
  it('returns valid HTML with user name', () => {
    const html = getSuccessPageHtml('田中太郎')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('田中太郎')
    expect(html).toContain('認証が完了しました')
  })

  it('escapes XSS in user name', () => {
    const html = getSuccessPageHtml('<script>alert("xss")</script>')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('includes auto-close script', () => {
    const html = getSuccessPageHtml('user')
    expect(html).toContain('window.close()')
  })
})

describe('getErrorPageHtml', () => {
  it('returns valid HTML with error message', () => {
    const html = getErrorPageHtml('Invalid state')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Invalid state')
    expect(html).toContain('認証に失敗しました')
  })

  it('escapes XSS in error message', () => {
    const html = getErrorPageHtml('<img onerror="alert(1)">')
    expect(html).not.toContain('<img onerror')
    expect(html).toContain('&lt;img onerror')
  })
})
