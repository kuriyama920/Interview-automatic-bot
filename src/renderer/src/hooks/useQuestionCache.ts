/**
 * 想定質問キャッシュ＆即時マッチングフック
 *
 * 起動時に想定Q&Aをロードし、面接官の発話をビグラム類似度で即座にマッチング。
 * 高類似度のマッチが見つかれば保存済み回答を返し、AI生成をスキップして遅延ゼロを実現。
 */

import { useRef, useCallback, useEffect } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useQuestionCache')

interface CachedQuestion {
  question: string
  answer: string
  bigrams: Set<string>
}

export interface QuestionMatch {
  question: string
  answer: string
  similarity: number
}

const MATCH_THRESHOLD = 0.65
const MIN_QUERY_LENGTH = 6

/** テキストからビグラムセットを生成（日本語対応） */
export function computeBigrams(text: string): Set<string> {
  const normalized = text.replace(/[\s、。？！「」（）\u3000]/g, '')
  const set = new Set<string>()
  for (let i = 0; i <= normalized.length - 2; i++) {
    set.add(normalized.substring(i, i + 2))
  }
  return set
}

/** Jaccard 類似度（ビグラム） */
export function bigramSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersectionSize = 0
  for (const item of a) {
    if (b.has(item)) intersectionSize++
  }
  const unionSize = a.size + b.size - intersectionSize
  return unionSize > 0 ? intersectionSize / unionSize : 0
}

export function useQuestionCache() {
  const cacheRef = useRef<CachedQuestion[]>([])
  const loadedRef = useRef(false)

  /** Q&Aキャッシュをロード */
  const loadCache = useCallback(async () => {
    try {
      const result = await window.electron.questions.list()
      if (result.success && result.questions) {
        const items = result.questions
          .filter((q) => q.answer.trim().length > 0)
          .map((q) => ({
            question: q.question,
            answer: q.answer,
            bigrams: computeBigrams(q.question),
          }))
        cacheRef.current = items
        loadedRef.current = true
        log.info('Question cache loaded', { count: items.length })
      }
    } catch (error) {
      log.error('Failed to load question cache', { error: String(error) })
    }
  }, [])

  // 起動時にロード
  useEffect(() => {
    loadCache()
  }, [loadCache])

  /** クエリに最も類似する想定Q&Aを検索 */
  const findMatch = useCallback((query: string): QuestionMatch | null => {
    if (!loadedRef.current || cacheRef.current.length === 0) return null

    const trimmed = query.replace(/[\s、。？！「」（）\u3000]/g, '')
    if (trimmed.length < MIN_QUERY_LENGTH) return null

    const queryBigrams = computeBigrams(query)
    let bestMatch: QuestionMatch | null = null
    let bestSimilarity = 0

    for (const item of cacheRef.current) {
      const similarity = bigramSimilarity(queryBigrams, item.bigrams)
      if (similarity > bestSimilarity && similarity >= MATCH_THRESHOLD) {
        bestSimilarity = similarity
        bestMatch = {
          question: item.question,
          answer: item.answer,
          similarity,
        }
      }
    }

    if (bestMatch) {
      log.debug('Question match found', {
        query: query.substring(0, 30),
        matched: bestMatch.question.substring(0, 30),
        similarity: bestMatch.similarity.toFixed(3),
      })
    }

    return bestMatch
  }, [])

  /** キャッシュをクリア（ログアウト時等） */
  const clearCache = useCallback(() => {
    cacheRef.current = []
    loadedRef.current = false
    log.info('Question cache cleared')
  }, [])

  return { findMatch, refreshCache: loadCache, clearCache }
}
