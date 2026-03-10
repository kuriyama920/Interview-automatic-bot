/**
 * AI回答品質スコアラー
 *
 * 日本語の指示語（こそあど言葉）検出、固有名詞・数値チェックにより
 * AI生成回答の品質をスコアリング。
 * Self-Refine（品質不足時の自動リライト）判定に使用。
 */

/** こそあど言葉の検出パターン（/gフラグなし: matchAllで使用） */
const DEMONSTRATIVE_PATTERNS: RegExp[] = [
  // 代名詞: これ、それ、あれ（+ 複数形 これら、それら、あれら）
  /(?:これ|それ|あれ)(?:ら)?(?=[はがをにでも、。\s]|$)/,
  // 連体詞: この、その、あの
  /(?:この|その|あの)(?=[^\s、。])/,
  // 方向: こちら、そちら、あちら
  /(?:こちら|そちら|あちら)(?=[はがをにでもの、。\s]|$)/,
  // 場所: ここ、そこ、あそこ
  /(?:ここ|そこ|あそこ)(?=[はがをにでも、。\s]|$)/,
  // 様態: こういう、そういう、ああいう
  /(?:こういう|そういう|ああいう)/,
  // ような形: このような、そのような、あのような
  /(?:このような|そのような|あのような)/,
  // した形: こうした、そうした、ああした
  /(?:こうした|そうした|ああした)/,
  // な形: こんな、そんな、あんな
  /(?:こんな|そんな|あんな)(?=[^\s、。])/,
]

/** 具体的数値を検出するパターン */
const NUMBER_PATTERNS = /\d+[%％万円名件年月日時間回倍人個社台本枚]/

/** 固有名詞の指標パターン（カタカナ連続3文字以上、会社名接尾辞） */
const PROPER_NOUN_PATTERNS = /[ァ-ヶー]{3,}|株式会社|有限会社|合同会社/

export interface QualityScore {
  /** 総合スコア 0-100 */
  score: number
  /** 検出された指示語の数 */
  demonstrativeCount: number
  /** 検出された指示語のリスト（重複排除） */
  demonstratives: string[]
  /** 具体的な数値が含まれているか */
  hasSpecificNumbers: boolean
  /** 固有名詞が含まれているか */
  hasProperNouns: boolean
  /** 改善提案 */
  suggestions: string[]
}

/**
 * AI回答の品質をスコアリング
 *
 * スコアリング基準:
 * - 基本: 100点
 * - 指示語1つにつき: -15点
 * - 具体的数値あり: +5点
 * - 固有名詞あり: +5点
 */
export function scoreResponseQuality(response: string): QualityScore {
  let score = 100
  const foundDemonstratives: string[] = []

  for (const pattern of DEMONSTRATIVE_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, 'g')
    const matches = response.match(globalPattern)
    if (matches) {
      foundDemonstratives.push(...matches)
    }
  }

  const demonstrativeCount = foundDemonstratives.length
  score -= demonstrativeCount * 15

  const hasSpecificNumbers = NUMBER_PATTERNS.test(response)
  if (hasSpecificNumbers) score += 5

  const hasProperNouns = PROPER_NOUN_PATTERNS.test(response)
  if (hasProperNouns) score += 5

  score = Math.max(0, Math.min(100, score))

  const suggestions: string[] = []
  if (demonstrativeCount > 0) {
    const unique = [...new Set(foundDemonstratives)]
    suggestions.push(
      `指示語を${demonstrativeCount}個検出: ${unique.join('、')}。具体的な名詞に置き換えてください。`
    )
  }
  if (!hasSpecificNumbers) {
    suggestions.push('具体的な数値（年数、割合、人数等）を含めてください。')
  }
  if (!hasProperNouns) {
    suggestions.push('固有名詞（企業名、技術名等）を含めてください。')
  }

  return {
    score,
    demonstrativeCount,
    demonstratives: [...new Set(foundDemonstratives)],
    hasSpecificNumbers,
    hasProperNouns,
    suggestions,
  }
}

/**
 * Self-Refine用のリファインプロンプトを構築
 */
export function buildRefinePrompt(
  originalResponse: string,
  quality: QualityScore,
  context: string,
): string {
  const issues = quality.suggestions.join('\n- ')

  return `以下の面接回答を改善してください。

## 改善すべき点
- ${issues}

## 元の回答
${originalResponse}

## 参照情報
${context}

## 改善ルール
- 指示語（これ・それ・あの等）を全て具体的な名詞に置き換える
- 構造や長さは維持しつつ、曖昧な表現を具体的な情報に置き換える
- 面接で口に出して話す自然な話し言葉を維持する
- 改善した回答のみを出力（説明不要）`
}
