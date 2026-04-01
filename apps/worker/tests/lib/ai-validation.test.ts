import { describe, it, expect } from 'vitest'
import {
  validateQuestion,
  validateContext,
  sanitizeTurnId,
  validateGenerateRequest,
  validateSummarizeRequest,
  validateGenerateV2Request,
  validateEmbeddingsRequest,
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

describe('validateGenerateRequest', () => {
  it('returns error when body is null', () => {
    expect(validateGenerateRequest(null)).toEqual({ error: 'Request body is required' })
  })

  it('returns error when body is not an object', () => {
    expect(validateGenerateRequest('string')).toEqual({ error: 'Request body is required' })
  })

  it('returns error when question is missing', () => {
    const result = validateGenerateRequest({ context: 'some context' })
    expect('error' in result).toBe(true)
  })

  it('returns validated request with defaults for minimal valid input', () => {
    const result = validateGenerateRequest({ question: 'What is your name?' })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.question).toBe('What is your name?')
      expect(result.model).toBe('gpt-5-nano')
      expect(result.maxTokens).toBe(800)
      expect(result.includeDocumentContext).toBe(true)
      expect(result.context).toBeUndefined()
    }
  })

  it('uses requested model when it is in ALLOWED_MODELS', () => {
    const result = validateGenerateRequest({ question: 'test', model: 'gpt-4o-mini' })
    if (!('error' in result)) {
      expect(result.model).toBe('gpt-4o-mini')
    }
  })

  it('falls back to default model when model is not allowed', () => {
    const result = validateGenerateRequest({ question: 'test', model: 'gpt-unknown' })
    if (!('error' in result)) {
      expect(result.model).toBe('gpt-5-nano')
    }
  })

  it('uses provided maxTokens within valid range', () => {
    const result = validateGenerateRequest({ question: 'test', maxTokens: 2000 })
    if (!('error' in result)) {
      expect(result.maxTokens).toBe(2000)
    }
  })

  it('falls back to default maxTokens when out of range', () => {
    const result = validateGenerateRequest({ question: 'test', maxTokens: 5000 })
    if (!('error' in result)) {
      expect(result.maxTokens).toBe(800)
    }
  })

  it('falls back to default maxTokens when maxTokens is 0 or negative', () => {
    const result = validateGenerateRequest({ question: 'test', maxTokens: 0 })
    if (!('error' in result)) {
      expect(result.maxTokens).toBe(800)
    }
  })

  it('sets temperature to undefined for models without temperature support', () => {
    const result = validateGenerateRequest({ question: 'test', model: 'gpt-5-nano' })
    if (!('error' in result)) {
      expect(result.temperature).toBeUndefined()
    }
  })

  it('sets default temperature of 0.7 for models with temperature support', () => {
    const result = validateGenerateRequest({ question: 'test', model: 'gpt-4o-mini' })
    if (!('error' in result)) {
      expect(result.temperature).toBe(0.7)
    }
  })

  it('uses provided temperature within valid range', () => {
    const result = validateGenerateRequest({ question: 'test', model: 'gpt-4o-mini', temperature: 1.5 })
    if (!('error' in result)) {
      expect(result.temperature).toBe(1.5)
    }
  })

  it('falls back to default temperature when out of range', () => {
    const result = validateGenerateRequest({ question: 'test', model: 'gpt-4o-mini', temperature: 3 })
    if (!('error' in result)) {
      expect(result.temperature).toBe(0.7)
    }
  })

  it('sets includeDocumentContext to false when explicitly set', () => {
    const result = validateGenerateRequest({ question: 'test', includeDocumentContext: false })
    if (!('error' in result)) {
      expect(result.includeDocumentContext).toBe(false)
    }
  })

  it('passes through context when provided', () => {
    const result = validateGenerateRequest({ question: 'test', context: 'my context' })
    if (!('error' in result)) {
      expect(result.context).toBe('my context')
    }
  })
})

describe('validateSummarizeRequest', () => {
  it('returns error when body is null', () => {
    expect(validateSummarizeRequest(null)).toEqual({ error: 'Request body is required' })
  })

  it('returns error when interviewer is missing', () => {
    const result = validateSummarizeRequest({ candidate: 'answer' })
    expect(result).toEqual({ error: 'interviewer is required and must be a string' })
  })

  it('returns error when candidate is missing', () => {
    const result = validateSummarizeRequest({ interviewer: 'question' })
    expect(result).toEqual({ error: 'candidate is required and must be a string' })
  })

  it('returns validated request for valid input', () => {
    const result = validateSummarizeRequest({
      interviewer: 'Tell me about yourself',
      candidate: 'I am a developer',
    })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.interviewer).toBe('Tell me about yourself')
      expect(result.candidate).toBe('I am a developer')
      expect(result.previousSummary).toBe('')
    }
  })

  it('trims interviewer and candidate', () => {
    const result = validateSummarizeRequest({
      interviewer: '  question  ',
      candidate: '  answer  ',
    })
    if (!('error' in result)) {
      expect(result.interviewer).toBe('question')
      expect(result.candidate).toBe('answer')
    }
  })

  it('returns error when interviewer exceeds max length', () => {
    const result = validateSummarizeRequest({
      interviewer: 'a'.repeat(5001),
      candidate: 'answer',
    })
    expect('error' in result).toBe(true)
  })

  it('returns error when candidate exceeds max length', () => {
    const result = validateSummarizeRequest({
      interviewer: 'question',
      candidate: 'a'.repeat(5001),
    })
    expect('error' in result).toBe(true)
  })

  it('returns error when previousSummary exceeds max length', () => {
    const result = validateSummarizeRequest({
      interviewer: 'question',
      candidate: 'answer',
      previousSummary: 'a'.repeat(2001),
    })
    expect('error' in result).toBe(true)
  })

  it('passes through previousSummary when provided', () => {
    const result = validateSummarizeRequest({
      interviewer: 'question',
      candidate: 'answer',
      previousSummary: 'previous summary text',
    })
    if (!('error' in result)) {
      expect(result.previousSummary).toBe('previous summary text')
    }
  })
})

describe('validateGenerateV2Request', () => {
  it('returns error when body is null', () => {
    expect(validateGenerateV2Request(null)).toEqual({ error: 'Request body is required' })
  })

  it('returns error when question is missing', () => {
    const result = validateGenerateV2Request({ phase: 'speculative' })
    expect('error' in result).toBe(true)
  })

  it('returns error when phase is missing', () => {
    const result = validateGenerateV2Request({ question: 'test' })
    expect(result).toEqual({ error: 'phase must be "speculative" or "committed"' })
  })

  it('returns error when phase is invalid', () => {
    const result = validateGenerateV2Request({ question: 'test', phase: 'invalid' })
    expect(result).toEqual({ error: 'phase must be "speculative" or "committed"' })
  })

  it('returns validated request for speculative phase', () => {
    const result = validateGenerateV2Request({
      question: 'What is React?',
      phase: 'speculative',
      turnId: 'abc-123',
    })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.question).toBe('What is React?')
      expect(result.phase).toBe('speculative')
      expect(result.turnId).toBe('abc-123')
      expect(result.speculativeText).toBeUndefined()
    }
  })

  it('returns validated request for committed phase', () => {
    const result = validateGenerateV2Request({
      question: 'What is React?',
      phase: 'committed',
      turnId: 'abc-123',
    })
    if (!('error' in result)) {
      expect(result.phase).toBe('committed')
    }
  })

  it('sanitizes invalid turnId to "unknown"', () => {
    const result = validateGenerateV2Request({
      question: 'test',
      phase: 'speculative',
      turnId: '<script>alert(1)</script>',
    })
    if (!('error' in result)) {
      expect(result.turnId).toBe('unknown')
    }
  })

  it('truncates speculativeText to max length', () => {
    const longText = 'a'.repeat(3000)
    const result = validateGenerateV2Request({
      question: 'test',
      phase: 'committed',
      speculativeText: longText,
    })
    if (!('error' in result)) {
      expect(result.speculativeText).toHaveLength(2000)
    }
  })

  it('sets speculativeText to undefined when empty', () => {
    const result = validateGenerateV2Request({
      question: 'test',
      phase: 'committed',
      speculativeText: '',
    })
    if (!('error' in result)) {
      expect(result.speculativeText).toBeUndefined()
    }
  })

  it('passes through context', () => {
    const result = validateGenerateV2Request({
      question: 'test',
      phase: 'speculative',
      context: 'some context',
    })
    if (!('error' in result)) {
      expect(result.context).toBe('some context')
    }
  })
})

describe('validateEmbeddingsRequest', () => {
  it('returns error when body is null', () => {
    expect(validateEmbeddingsRequest(null)).toEqual({ error: 'Request body is required' })
  })

  it('returns error when neither text nor texts is provided', () => {
    expect(validateEmbeddingsRequest({})).toEqual({ error: 'text or texts is required' })
  })

  it('returns single text as inputTexts array', () => {
    const result = validateEmbeddingsRequest({ text: 'hello world' })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.inputTexts).toEqual(['hello world'])
    }
  })

  it('returns error when text is empty string', () => {
    const result = validateEmbeddingsRequest({ text: '   ' })
    expect(result).toEqual({ error: 'text must be a non-empty string' })
  })

  it('returns error when text is not a string', () => {
    const result = validateEmbeddingsRequest({ text: 123 })
    expect(result).toEqual({ error: 'text must be a non-empty string' })
  })

  it('returns error when text exceeds max length', () => {
    const result = validateEmbeddingsRequest({ text: 'a'.repeat(8001) })
    expect('error' in result).toBe(true)
  })

  it('returns texts array as inputTexts', () => {
    const result = validateEmbeddingsRequest({ texts: ['hello', 'world'] })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.inputTexts).toEqual(['hello', 'world'])
    }
  })

  it('returns error when texts is empty array', () => {
    expect(validateEmbeddingsRequest({ texts: [] })).toEqual({ error: 'texts must be a non-empty array' })
  })

  it('returns error when texts exceeds max count (20)', () => {
    const texts = Array.from({ length: 21 }, (_, i) => `text-${i}`)
    const result = validateEmbeddingsRequest({ texts })
    expect('error' in result).toBe(true)
  })

  it('returns error when any text in texts is empty', () => {
    const result = validateEmbeddingsRequest({ texts: ['valid', '  '] })
    expect(result).toEqual({ error: 'Each text must be a non-empty string' })
  })

  it('returns error when any text in texts exceeds max length', () => {
    const result = validateEmbeddingsRequest({ texts: ['valid', 'a'.repeat(8001)] })
    expect('error' in result).toBe(true)
  })

  it('prefers text over texts when both are provided', () => {
    const result = validateEmbeddingsRequest({ text: 'single', texts: ['array'] })
    if (!('error' in result)) {
      expect(result.inputTexts).toEqual(['single'])
    }
  })
})
