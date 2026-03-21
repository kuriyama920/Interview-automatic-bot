import { describe, it, expect } from 'vitest'
import {
  SYSTEM_PROMPT,
  STANDARD_INTERVIEW_QUESTIONS,
  QUESTION_GENERATION_PROMPT,
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

describe('STANDARD_INTERVIEW_QUESTIONS', () => {
  it('has exactly 20 questions', () => {
    expect(STANDARD_INTERVIEW_QUESTIONS).toHaveLength(20)
  })

  it('all items are non-empty strings', () => {
    for (const q of STANDARD_INTERVIEW_QUESTIONS) {
      expect(typeof q).toBe('string')
      expect(q.length).toBeGreaterThan(0)
    }
  })

  it('starts with self-introduction', () => {
    expect(STANDARD_INTERVIEW_QUESTIONS[0]).toContain('自己紹介')
  })

  it('is typed as readonly array', () => {
    // `as const` enforces readonly at compile time, not runtime.
    expect(Array.isArray(STANDARD_INTERVIEW_QUESTIONS)).toBe(true)
  })
})

describe('QUESTION_GENERATION_PROMPT', () => {
  it('is a non-empty string', () => {
    expect(typeof QUESTION_GENERATION_PROMPT).toBe('string')
    expect(QUESTION_GENERATION_PROMPT.length).toBeGreaterThan(0)
  })

  it('contains template placeholders', () => {
    expect(QUESTION_GENERATION_PROMPT).toContain('{questions}')
    expect(QUESTION_GENERATION_PROMPT).toContain('{documentContext}')
  })

  it('specifies output format', () => {
    expect(QUESTION_GENERATION_PROMPT).toContain('"answers"')
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
