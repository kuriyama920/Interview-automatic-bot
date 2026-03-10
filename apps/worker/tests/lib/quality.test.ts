import { describe, it, expect } from 'vitest'
import { scoreResponseQuality, buildRefinePrompt } from '../../src/lib/quality'

describe('scoreResponseQuality', () => {
  it('returns score 100 for text with no demonstratives', () => {
    const result = scoreResponseQuality(
      '株式会社ABCでは月間100万PVのECサイトリニューアルプロジェクトにリードエンジニアとして携わりました。'
    )
    expect(result.score).toBe(100)
    expect(result.demonstrativeCount).toBe(0)
    expect(result.demonstratives).toEqual([])
  })

  it('deducts 15 points per demonstrative pronoun', () => {
    const result = scoreResponseQuality('これは良い経験でした。それを活かしたいです。')
    expect(result.demonstrativeCount).toBe(2)
    expect(result.score).toBe(100 - 15 * 2) // 70
  })

  it('detects これ・それ・あれ（代名詞）', () => {
    const result = scoreResponseQuality('これは大切です。それが重要です。あれも役立ちました。')
    expect(result.demonstratives).toContain('これ')
    expect(result.demonstratives).toContain('それ')
    expect(result.demonstratives).toContain('あれ')
    expect(result.demonstrativeCount).toBe(3)
  })

  it('detects この・その・あの（連体詞）', () => {
    const result = scoreResponseQuality('この経験を活かして、その知見で、あの環境で働きたいです。')
    expect(result.demonstratives).toContain('この')
    expect(result.demonstratives).toContain('その')
    expect(result.demonstratives).toContain('あの')
  })

  it('detects こちら・そちら・あちら', () => {
    const result = scoreResponseQuality('こちらの会社で、そちらは良い環境です。あちらも検討しました。')
    expect(result.demonstratives).toContain('こちら')
    expect(result.demonstratives).toContain('そちら')
    expect(result.demonstratives).toContain('あちら')
  })

  it('detects ここ・そこ・あそこ', () => {
    const result = scoreResponseQuality('ここで働きたい。そこが魅力です。あそこも良い環境です。')
    expect(result.demonstratives).toContain('ここ')
    expect(result.demonstratives).toContain('そこ')
    expect(result.demonstratives).toContain('あそこ')
  })

  it('detects こういう・そういう・ああいう', () => {
    const result = scoreResponseQuality('こういう仕事が好きです。そういう環境で、ああいう取り組みを。')
    expect(result.demonstratives).toContain('こういう')
    expect(result.demonstratives).toContain('そういう')
    expect(result.demonstratives).toContain('ああいう')
  })

  it('detects このような・そのような・あのような', () => {
    const result = scoreResponseQuality('このような経験から、そのような環境で、あのような成果を出したいです。')
    expect(result.demonstratives).toContain('このような')
    expect(result.demonstratives).toContain('そのような')
    expect(result.demonstratives).toContain('あのような')
  })

  it('detects こんな・そんな・あんな', () => {
    const result = scoreResponseQuality('こんな仕事がしたいです。そんな環境で、あんな成果を。')
    expect(result.demonstratives).toContain('こんな')
    expect(result.demonstratives).toContain('そんな')
    expect(result.demonstratives).toContain('あんな')
  })

  it('adds 5 points for specific numbers', () => {
    const withNumbers = scoreResponseQuality('経験年数は5年です。')
    const withoutNumbers = scoreResponseQuality('経験年数は多いです。')
    expect(withNumbers.hasSpecificNumbers).toBe(true)
    expect(withoutNumbers.hasSpecificNumbers).toBe(false)
    // 両方100にクランプされるのでスコア差ではなくフラグで検証
  })

  it('detects various number formats', () => {
    expect(scoreResponseQuality('3年間の経験').hasSpecificNumbers).toBe(true)
    expect(scoreResponseQuality('売上50%増加').hasSpecificNumbers).toBe(true)
    expect(scoreResponseQuality('15名のチーム').hasSpecificNumbers).toBe(true)
    expect(scoreResponseQuality('100万円の削減').hasSpecificNumbers).toBe(true)
    expect(scoreResponseQuality('4件のプロジェクト').hasSpecificNumbers).toBe(true)
  })

  it('adds 5 points for proper nouns', () => {
    // カタカナ3文字以上または会社名接尾辞で検出
    const withProper = scoreResponseQuality('タイプスクリプトでの開発経験があります。')
    const withoutProper = scoreResponseQuality('開発経験があります。')
    expect(withProper.hasProperNouns).toBe(true)
    expect(withoutProper.hasProperNouns).toBe(false)
  })

  it('detects company name patterns', () => {
    expect(scoreResponseQuality('株式会社ABCで').hasProperNouns).toBe(true)
    expect(scoreResponseQuality('有限会社テストで').hasProperNouns).toBe(true)
    expect(scoreResponseQuality('合同会社サンプルで').hasProperNouns).toBe(true)
  })

  it('clamps score to minimum 0', () => {
    // 多数の指示語を含むテキスト（7個以上で0以下になるはず）
    const text = 'これは、それが、あれも、この環境で、その技術と、あの会社で、こちらの経験と、そちらも'
    const result = scoreResponseQuality(text)
    expect(result.score).toBeGreaterThanOrEqual(0)
  })

  it('clamps score to maximum 100', () => {
    const result = scoreResponseQuality(
      '株式会社ABCで3年間TypeScriptを使用し、売上200%増を達成しました。'
    )
    // base 100 + 5(numbers) + 5(proper) = 110 → clamped to 100
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('returns unique demonstratives list (no duplicates)', () => {
    const result = scoreResponseQuality('これは良い。これも大切。これが重要。')
    expect(result.demonstratives).toEqual(['これ'])
    expect(result.demonstrativeCount).toBe(3) // count includes duplicates
  })

  it('generates suggestion for demonstratives when found', () => {
    const result = scoreResponseQuality('その経験を活かしたい。')
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    expect(result.suggestions[0]).toContain('指示語')
  })

  it('generates suggestion for missing numbers', () => {
    const result = scoreResponseQuality('開発経験があります。')
    expect(result.suggestions.some(s => s.includes('数値'))).toBe(true)
  })

  it('generates suggestion for missing proper nouns', () => {
    const result = scoreResponseQuality('開発経験があります。')
    expect(result.suggestions.some(s => s.includes('固有名詞'))).toBe(true)
  })

  it('handles empty string input', () => {
    const result = scoreResponseQuality('')
    expect(result.score).toBe(100)
    expect(result.demonstrativeCount).toBe(0)
  })

  it('does not falsely detect demonstratives in normal words', () => {
    // 「ここ」が文末や助詞前でない場合はマッチしないことを確認
    const result = scoreResponseQuality('株式会社ABCでリードエンジニアとして3年間勤務しました。')
    expect(result.demonstrativeCount).toBe(0)
  })
})

describe('buildRefinePrompt', () => {
  it('includes all suggestions from quality score', () => {
    const quality = scoreResponseQuality('その経験を活かして、この会社で働きたいです。')
    const result = buildRefinePrompt('元の回答', quality, '参照情報')
    expect(result).toContain('指示語')
  })

  it('includes original response text', () => {
    const quality = scoreResponseQuality('テスト文')
    const result = buildRefinePrompt('元の面接回答テキスト', quality, '参照情報')
    expect(result).toContain('元の面接回答テキスト')
  })

  it('includes context text', () => {
    const quality = scoreResponseQuality('テスト文')
    const result = buildRefinePrompt('元の回答', quality, 'プロフィール情報と履歴書')
    expect(result).toContain('プロフィール情報と履歴書')
  })

  it('handles empty suggestions array', () => {
    const quality = scoreResponseQuality(
      '株式会社ABCで3年間TypeScriptを使用して開発しました。'
    )
    const result = buildRefinePrompt('元の回答', quality, '参照情報')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
