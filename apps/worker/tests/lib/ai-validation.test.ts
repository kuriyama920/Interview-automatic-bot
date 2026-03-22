import { describe, it, expect } from 'vitest'
import {
  validateQuestion,
  validateContext,
  sanitizeTurnId,
  validateGenerateRequest,
  validateSummarizeRequest,
  validateGenerateV2Request,
  ALLOWED_MODELS,
  MODELS_WITHOUT_TEMPERATURE,
  MODELS_WITH_REASONING,
  MAX_QUESTION_LENGTH,
  MAX_CONTEXT_LENGTH,
} from '../../src/lib/ai-validation'

describe('validateQuestion', () => {
  it('returns error when question is missing', () => {
    const result = validateQuestion({})
    expect(result).toEqual({ error: 'question is required and must be a string' })
  })

  it('returns error when question is not a string', () => {
    const result = validateQuestion({ question: 123 })
    expect(result).toEqual({ error: 'question is required and must be a string' })
  })

  it('returns error when question is empty after trim', () => {
    const result = validateQuestion({ question: '   ' })
    expect(result).toEqual({ error: 'question cannot be empty' })
  })

  it('returns error when question exceeds max length', () => {
    const result = validateQuestion({ question: 'a'.repeat(MAX_QUESTION_LENGTH + 1) })
    expect('error' in result && result.error).toContain('must be less than')
  })

  it('returns trimmed question on success', () => {
    const result = validateQuestion({ question: '  hello world  ' })
    expect(result).toEqual({ question: 'hello world' })
  })

  it('accepts question at exactly max length', () => {
    const result = validateQuestion({ question: 'a'.repeat(MAX_QUESTION_LENGTH) })
    expect('question' in result).toBe(true)
  })
})

describe('validateContext', () => {
  it('returns undefined when context is not a string', () => {
    const result = validateContext({ context: 123 })
    expect(result).toEqual({ context: undefined })
  })

  it('returns undefined when context is missing', () => {
    const result = validateContext({})
    expect(result).toEqual({ context: undefined })
  })

  it('returns context string when valid', () => {
    const result = validateContext({ context: 'some context' })
    expect(result).toEqual({ context: 'some context' })
  })

  it('returns error when context exceeds max length', () => {
    const result = validateContext({ context: 'a'.repeat(MAX_CONTEXT_LENGTH + 1) })
    expect('error' in result).toBe(true)
  })
})


describe('sanitizeTurnId', () => {
  it('returns "unknown" for non-string input', () => {
    expect(sanitizeTurnId(undefined)).toBe('unknown')
    expect(sanitizeTurnId(null)).toBe('unknown')
    expect(sanitizeTurnId(123)).toBe('unknown')
  })

  it('returns "unknown" for empty string', () => {
    expect(sanitizeTurnId('')).toBe('unknown')
  })

  it('returns "unknown" for invalid format', () => {
    expect(sanitizeTurnId('not-a-valid-id!')).toBe('unknown')
    expect(sanitizeTurnId('<script>alert(1)</script>')).toBe('unknown')
  })

  it('returns the turnId when format is valid UUID-like', () => {
    expect(sanitizeTurnId('abc1def2-ab12-4c12-8d12-abcdef123456')).toBe('abc1def2-ab12-4c12-8d12-abcdef123456')
  })

  it('accepts hex with hyphens', () => {
    expect(sanitizeTurnId('abc-def-123')).toBe('abc-def-123')
  })
})
