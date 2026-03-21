/**
 * Speculative 採用判定ユーティリティ
 * Levenshtein距離ベースの変化率で Speculative テキストの採用可否を判定
 */

/** Levenshtein計算の最大文字数（DoS防止: O(mn)のため上限を設ける） */
const MAX_LEVENSHTEIN_LENGTH = 5000

/**
 * 文字レベル Levenshtein 距離（Wagner-Fischer アルゴリズム）
 * 性能例外: O(mn)アルゴリズムのため配列のインプレース更新を使用（イミュータブルパターンの例外）
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length > MAX_LEVENSHTEIN_LENGTH || b.length > MAX_LEVENSHTEIN_LENGTH) {
    return Math.max(a.length, b.length)
  }

  const m = a.length
  const n = b.length

  // 性能最適化: 行列の代わりに2行のみ使用（O(n)空間）
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  let curr = new Array<number>(n + 1)

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1]
      } else {
        curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1])
      }
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[n]
}

/** 変化率: Levenshtein距離 / max(len(a), len(b)) */
export function changeRate(speculative: string, committed: string): number {
  const maxLen = Math.max(speculative.length, committed.length)
  if (maxLen === 0) return 0
  return levenshteinDistance(speculative, committed) / maxLen
}

export interface AdoptionConfig {
  /** 変化率の閾値（これ以下なら採用）。デフォルト 0.3 (30%) */
  changeRateThreshold: number
  /** Speculative最低文字数。デフォルト 80 */
  minSpeculativeLength: number
  /** Speculative最低文数。デフォルト 2 */
  minSentenceCount: number
}

export const DEFAULT_ADOPTION_CONFIG: AdoptionConfig = {
  changeRateThreshold: 0.3,
  minSpeculativeLength: 80,
  minSentenceCount: 2,
}

/** 日本語の文数をカウント（。！？\nで分割） */
export function countSentences(text: string): number {
  const sentences = text.split(/[。！？\n]/).filter((s) => s.trim().length > 0)
  return sentences.length
}

export interface AdoptionResult {
  adopted: boolean
  reason: string
  changeRate: number
}

/** Speculative テキストの採用可否を判定 */
export function shouldAdoptSpeculative(
  speculativeText: string,
  committedText: string,
  config: AdoptionConfig = DEFAULT_ADOPTION_CONFIG,
): AdoptionResult {
  const rate = changeRate(speculativeText, committedText)

  // D-4 guardrails
  if (speculativeText.length < config.minSpeculativeLength) {
    return { adopted: false, reason: 'speculative_too_short', changeRate: rate }
  }

  if (countSentences(speculativeText) < config.minSentenceCount) {
    return { adopted: false, reason: 'too_few_sentences', changeRate: rate }
  }

  if (rate > config.changeRateThreshold) {
    return { adopted: false, reason: 'change_rate_exceeded', changeRate: rate }
  }

  return { adopted: true, reason: 'accepted', changeRate: rate }
}
