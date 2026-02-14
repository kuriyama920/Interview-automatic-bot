import { describe, it, expect, vi } from 'vitest'

// Mock renderer logger
vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { computeBigrams, bigramSimilarity } from '../../src/renderer/src/hooks/useQuestionCache'

describe('computeBigrams', () => {
  it('should generate bigrams from ASCII text', () => {
    const result = computeBigrams('abcd')
    expect(result).toEqual(new Set(['ab', 'bc', 'cd']))
  })

  it('should generate bigrams from Japanese text', () => {
    const result = computeBigrams('自己紹介')
    expect(result).toEqual(new Set(['自己', '己紹', '紹介']))
  })

  it('should strip whitespace and punctuation before generating bigrams', () => {
    const result = computeBigrams('自己　紹介、です。')
    // After stripping: '自己紹介です'
    expect(result).toEqual(new Set(['自己', '己紹', '紹介', '介で', 'です']))
  })

  it('should return empty set for single character', () => {
    const result = computeBigrams('あ')
    expect(result.size).toBe(0)
  })

  it('should return empty set for empty string', () => {
    const result = computeBigrams('')
    expect(result.size).toBe(0)
  })

  it('should handle text with only punctuation', () => {
    const result = computeBigrams('、。？！')
    expect(result.size).toBe(0)
  })

  it('should strip Japanese brackets and full-width spaces', () => {
    const result = computeBigrams('「テスト」（確認）')
    // After stripping: 'テスト確認'
    expect(result).toEqual(new Set(['テス', 'スト', 'ト確', '確認']))
  })
})

describe('bigramSimilarity', () => {
  it('should return 1.0 for identical sets', () => {
    const a = new Set(['ab', 'bc', 'cd'])
    const b = new Set(['ab', 'bc', 'cd'])
    expect(bigramSimilarity(a, b)).toBe(1)
  })

  it('should return 0 for completely different sets', () => {
    const a = new Set(['ab', 'bc'])
    const b = new Set(['xy', 'yz'])
    expect(bigramSimilarity(a, b)).toBe(0)
  })

  it('should return 0 when either set is empty', () => {
    const empty = new Set<string>()
    const nonEmpty = new Set(['ab', 'bc'])
    expect(bigramSimilarity(empty, nonEmpty)).toBe(0)
    expect(bigramSimilarity(nonEmpty, empty)).toBe(0)
    expect(bigramSimilarity(empty, empty)).toBe(0)
  })

  it('should compute correct Jaccard similarity for partial overlap', () => {
    const a = new Set(['ab', 'bc', 'cd'])       // 3 items
    const b = new Set(['ab', 'bc', 'de', 'ef'])  // 4 items
    // intersection = {ab, bc} = 2
    // union = 3 + 4 - 2 = 5
    // similarity = 2/5 = 0.4
    expect(bigramSimilarity(a, b)).toBeCloseTo(0.4)
  })

  it('should return correct similarity for Japanese bigrams', () => {
    const a = computeBigrams('自己紹介をしてください')
    const b = computeBigrams('自己紹介をお願いします')
    const similarity = bigramSimilarity(a, b)
    expect(similarity).toBeGreaterThan(0)
    expect(similarity).toBeLessThan(1)
  })

  it('should return high similarity for nearly identical Japanese phrases', () => {
    const a = computeBigrams('あなたの強みを教えてください')
    const b = computeBigrams('あなたの強みを教えて下さい')
    const similarity = bigramSimilarity(a, b)
    expect(similarity).toBeGreaterThanOrEqual(0.65)
  })
})

describe('matching integration', () => {
  it('should compute high similarity for same question with minor differences', () => {
    const q1 = '志望動機を教えてください'
    const q2 = '志望動機を教えて下さい'
    const bigrams1 = computeBigrams(q1)
    const bigrams2 = computeBigrams(q2)
    const similarity = bigramSimilarity(bigrams1, bigrams2)
    expect(similarity).toBeGreaterThanOrEqual(0.65)
  })

  it('should compute low similarity for completely different questions', () => {
    const q1 = '自己紹介をしてください'
    const q2 = '給与の希望はありますか'
    const bigrams1 = computeBigrams(q1)
    const bigrams2 = computeBigrams(q2)
    const similarity = bigramSimilarity(bigrams1, bigrams2)
    expect(similarity).toBeLessThan(0.3)
  })

  it('should handle short query (below MIN_QUERY_LENGTH threshold)', () => {
    const shortQuery = 'テスト'
    const bigrams = computeBigrams(shortQuery)
    // Still computes bigrams, but the hook would reject this query
    expect(bigrams.size).toBe(2) // テス, スト
  })
})
