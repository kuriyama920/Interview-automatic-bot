import { describe, it, expect } from 'vitest'
import {
  levenshteinDistance,
  changeRate,
  shouldAdoptSpeculative,
  countSentences,
  DEFAULT_ADOPTION_CONFIG,
} from '../../src/renderer/src/utils/speculative-adoption'
import type { AdoptionConfig } from '../../src/renderer/src/utils/speculative-adoption'

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0)
  })

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0)
  })

  it('returns string length for empty string comparison', () => {
    expect(levenshteinDistance('abc', '')).toBe(3)
    expect(levenshteinDistance('', 'abc')).toBe(3)
  })

  it('calculates correct distance for simple edits', () => {
    // kitten -> sitting requires 3 edits: k->s, e->i, +g
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
  })

  it('handles single character difference', () => {
    expect(levenshteinDistance('cat', 'car')).toBe(1)
  })

  it('handles insertion', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1)
  })

  it('handles deletion', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1)
  })

  it('handles Japanese text', () => {
    expect(levenshteinDistance('面接対策', '面接対応')).toBe(1)
  })

  it('handles completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3)
  })
})

describe('changeRate', () => {
  it('returns 0 for identical strings', () => {
    expect(changeRate('abc', 'abc')).toBe(0)
  })

  it('returns 1 for completely different strings of same length', () => {
    expect(changeRate('abc', 'xyz')).toBe(1)
  })

  it('returns 0 for empty strings', () => {
    expect(changeRate('', '')).toBe(0)
  })

  it('calculates rate based on max length', () => {
    // 'abc' vs 'abcd': distance = 1, maxLen = 4
    expect(changeRate('abc', 'abcd')).toBe(0.25)
  })

  it('is symmetric in max length (not in distance direction)', () => {
    const rate1 = changeRate('abc', 'abcd')
    const rate2 = changeRate('abcd', 'abc')
    // Both should be 1/4 = 0.25
    expect(rate1).toBe(rate2)
  })

  it('handles Japanese text pairs', () => {
    const spec = '面接対策'
    const comm = '面接対応'
    // distance = 1, maxLen = 4
    expect(changeRate(spec, comm)).toBe(0.25)
  })
})

describe('countSentences', () => {
  it('counts Japanese sentences ending with 。', () => {
    expect(countSentences('これは一文目です。これは二文目です。')).toBe(2)
  })

  it('counts sentences with exclamation and question marks', () => {
    expect(countSentences('本当ですか？はい！')).toBe(2)
  })

  it('counts newline-separated sentences', () => {
    expect(countSentences('一行目\n二行目')).toBe(2)
  })

  it('returns 0 for empty string', () => {
    expect(countSentences('')).toBe(0)
  })

  it('returns 1 for single sentence without terminator', () => {
    expect(countSentences('終端なし')).toBe(1)
  })

  it('ignores empty segments from consecutive terminators', () => {
    expect(countSentences('一文。。')).toBe(1)
  })

  it('handles mixed terminators', () => {
    expect(countSentences('質問です？回答です。驚きです！')).toBe(3)
  })
})

describe('DEFAULT_ADOPTION_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_ADOPTION_CONFIG.changeRateThreshold).toBe(0.3)
    expect(DEFAULT_ADOPTION_CONFIG.minSpeculativeLength).toBe(80)
    expect(DEFAULT_ADOPTION_CONFIG.minSentenceCount).toBe(2)
  })
})

describe('shouldAdoptSpeculative', () => {
  const config = DEFAULT_ADOPTION_CONFIG

  it('rejects speculative text shorter than minSpeculativeLength', () => {
    const result = shouldAdoptSpeculative('短い', '短い文章です。もう一文です。', config)
    expect(result.adopted).toBe(false)
    expect(result.reason).toBe('speculative_too_short')
    expect(typeof result.changeRate).toBe('number')
  })

  it('rejects speculative text with too few sentences', () => {
    // 100 characters but only 1 sentence (no terminator -> counted as 1)
    const longOneSentence = 'あ'.repeat(100)
    const result = shouldAdoptSpeculative(longOneSentence, longOneSentence, config)
    expect(result.adopted).toBe(false)
    expect(result.reason).toBe('too_few_sentences')
  })

  it('rejects when change rate exceeds threshold', () => {
    // Both strings must be >=80 chars and >=2 sentences to pass guardrails, but very different content
    const spec = 'これは面接の回答です。私の経験として、前職でプロジェクトマネージャーとして多くのプロジェクトを管理してきました。チーム運営やスケジュール管理が得意で、大規模案件も経験しています。'
    const comm = 'まったく異なる回答になります。私はエンジニアとして、技術的な問題解決に注力してきました。特にバックエンドの設計やクラウドインフラの構築に強みがあり、多くの実績を持っています。'
    const result = shouldAdoptSpeculative(spec, comm, config)
    expect(result.adopted).toBe(false)
    expect(result.reason).toBe('change_rate_exceeded')
  })

  it('adopts when speculative is similar enough to committed', () => {
    // Both >=80 chars, >=2 sentences, and very similar content (low change rate)
    const spec = 'これは面接の回答です。私の経験として、前職でプロジェクトマネージャーとして多くのプロジェクトを成功に導きました。特にチームビルディングに注力しました。品質管理も重要視しています。'
    const comm = 'これは面接の回答です。私の経験として、前職でプロジェクトマネージャーとして多くのプロジェクトを成功に導きました。特にチームビルディングと品質管理に注力しました。品質管理も重要視しています。'
    const result = shouldAdoptSpeculative(spec, comm, config)
    expect(result.adopted).toBe(true)
    expect(result.reason).toBe('accepted')
    expect(result.changeRate).toBeLessThanOrEqual(0.3)
  })

  it('returns changeRate in result even when rejected', () => {
    const result = shouldAdoptSpeculative('短い', '短い', config)
    expect(result.changeRate).toBeDefined()
    expect(typeof result.changeRate).toBe('number')
  })

  it('uses custom config thresholds', () => {
    const strictConfig: AdoptionConfig = {
      changeRateThreshold: 0.05,
      minSpeculativeLength: 10,
      minSentenceCount: 1,
    }
    // Meets strict config's minLength and minSentenceCount, but change rate exceeds 0.05
    const spec = '短めの回答ですが十分な長さ。'
    const comm = '短めの回答ですが十分な長さ。追加の文。'
    const result = shouldAdoptSpeculative(spec, comm, strictConfig)
    expect(result.adopted).toBe(false)
    expect(result.reason).toBe('change_rate_exceeded')
  })

  it('adopts identical texts that meet all guardrails', () => {
    // Must be >=80 chars and >=2 sentences
    const text = 'これは面接の回答です。私の経験として、前職でプロジェクトマネージャーとして多くのプロジェクトを成功に導きました。チームビルディングと品質管理を重要視しています。'
    const result = shouldAdoptSpeculative(text, text, config)
    expect(result.adopted).toBe(true)
    expect(result.reason).toBe('accepted')
    expect(result.changeRate).toBe(0)
  })

  it('checks guardrails in order: length → sentences → changeRate', () => {
    // Too short AND too few sentences → should report speculative_too_short (checked first)
    const result = shouldAdoptSpeculative('短', '短', config)
    expect(result.reason).toBe('speculative_too_short')
  })
})
