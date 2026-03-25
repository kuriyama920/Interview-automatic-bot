/**
 * Speculative 結果キャッシュ
 *
 * Speculative Lane の生成結果をキャッシュし、類似質問に対して
 * AI呼び出しをスキップしてキャッシュ結果を即座に返す。
 * LRU eviction + TTL で古いエントリを自動削除。
 */

import { computeBigrams } from '../hooks/useQuestionCache'

interface SpeculativeCacheEntry {
  text: string
  timestamp: number
}

/** Dice係数によるbigram類似度 (0.0 - 1.0) */
function diceSimilarity(a: string, b: string): number {
  const bigramsA = computeBigrams(a)
  const bigramsB = computeBigrams(b)
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0
  let intersectionSize = 0
  for (const item of bigramsA) {
    if (bigramsB.has(item)) intersectionSize++
  }
  return (2 * intersectionSize) / (bigramsA.size + bigramsB.size)
}

export class SpeculativeCache {
  private cache = new Map<string, SpeculativeCacheEntry>()
  private readonly maxSize: number
  private readonly ttlMs: number

  constructor(maxSize = 50, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  /** エントリを追加（LRU eviction付き） */
  set(key: string, text: string): void {
    // 既存キーの場合はMapの順序を更新するため一旦削除
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    // 最大サイズに達している場合は最古エントリを削除
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value!
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      text,
      timestamp: Date.now(),
    })
  }

  /** 完全一致でエントリを取得（TTLチェック付き） */
  get(key: string): string | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    return entry.text
  }

  /** bigram類似度で最も近いエントリを検索 */
  findSimilar(key: string, similarityThreshold = 0.8): string | null {
    const now = Date.now()
    let bestText: string | null = null
    let bestSimilarity = 0
    const expiredKeys: string[] = []

    for (const [cachedKey, entry] of this.cache) {
      if (now - entry.timestamp > this.ttlMs) {
        expiredKeys.push(cachedKey)
        continue
      }

      const similarity = diceSimilarity(key, cachedKey)
      if (similarity >= similarityThreshold && similarity > bestSimilarity) {
        bestSimilarity = similarity
        bestText = entry.text
      }
    }

    // TTL切れエントリを削除
    for (const expired of expiredKeys) {
      this.cache.delete(expired)
    }

    return bestText
  }

  /** 全エントリをクリア */
  clear(): void {
    this.cache.clear()
  }

  /** 現在のエントリ数 */
  get size(): number {
    return this.cache.size
  }
}
