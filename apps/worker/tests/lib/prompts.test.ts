import { describe, it, expect } from 'vitest'
import {
  SYSTEM_PROMPT,
  wrapUserInput,
} from '../../src/lib/prompts'

describe('SYSTEM_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof SYSTEM_PROMPT).toBe('string')
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0)
  })

  it('contains key instructions', () => {
    expect(SYSTEM_PROMPT).toContain('面接')
    expect(SYSTEM_PROMPT).toContain('話し言葉')
  })
})

describe('wrapUserInput', () => {
  it('wraps content with XML-style markers', () => {
    expect(wrapUserInput('user_question', '自己紹介をお願いします'))
      .toBe('<user_question>自己紹介をお願いします</user_question>')
  })

  it('handles empty content', () => {
    expect(wrapUserInput('label', '')).toBe('<label></label>')
  })

  it('preserves special characters in content', () => {
    const content = '質問に<script>alert("xss")</script>が含まれる場合'
    const result = wrapUserInput('user_question', content)
    expect(result).toBe(`<user_question>${content}</user_question>`)
  })

  it('works with different label names', () => {
    expect(wrapUserInput('context', 'テスト')).toBe('<context>テスト</context>')
    expect(wrapUserInput('document', '資料')).toBe('<document>資料</document>')
  })
})
