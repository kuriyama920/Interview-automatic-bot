/**
 * Embedding キャッシュ（Cloudflare Workers Cache API）
 *
 * RAGクエリのembedding生成は ~50-100ms かかるため、
 * 同一質問への再クエリを Cache API でキャッシュして高速化する。
 * TTL 10分で古いキャッシュを自動削除。
 * キーは SHA-256 ハッシュを使用してキー衝突を防止。
 */

import { generateEmbedding } from './openai'

const EMBEDDING_CACHE_TTL_SEC = 600
const EMBEDDING_CACHE_KEY_PREFIX = 'https://embedding-cache.internal/'

export async function normalizeKey(text: string): Promise<string> {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const encoder = new TextEncoder()
  const data = encoder.encode(normalized)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getCachedOrGenerateEmbedding(
  question: string,
  apiKey: string,
  ctx: ExecutionContext | undefined,
  env?: { CF_ACCOUNT_ID?: string; CF_AI_GATEWAY_ID?: string }
): Promise<number[]> {
  const cache = caches.default
  const key = await normalizeKey(question)
  const cacheKey = new Request(`${EMBEDDING_CACHE_KEY_PREFIX}${key}`)

  const cached = await cache.match(cacheKey)
  if (cached) {
    return cached.json() as Promise<number[]>
  }

  const embedding = await generateEmbedding(question, apiKey, env)

  // ctx が利用可能な場合のみキャッシュ書き込み（waitUntilで非同期）
  if (ctx) {
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify(embedding), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${EMBEDDING_CACHE_TTL_SEC}`,
          },
        })
      )
    )
  }

  return embedding
}

/**
 * 指定テキストのembeddingキャッシュを無効化する。
 * normalizeKeyで正規化したキーを使い、Cache APIから削除。
 */
export async function invalidateEmbeddingCache(text: string): Promise<boolean> {
  const cache = caches.default
  const key = await normalizeKey(text)
  const cacheKey = new Request(`${EMBEDDING_CACHE_KEY_PREFIX}${key}`)
  return cache.delete(cacheKey)
}

/**
 * 複数テキストのembeddingキャッシュを一括無効化する。
 * 正規化後に重複するキーは1回のみ削除。
 */
export async function invalidateEmbeddingCacheBatch(texts: string[]): Promise<void> {
  if (texts.length === 0) return

  const keys = await Promise.all(texts.map((t) => normalizeKey(t)))
  const uniqueKeys = [...new Set(keys)]
  const cache = caches.default
  await Promise.all(
    uniqueKeys.map((key) => cache.delete(new Request(`${EMBEDDING_CACHE_KEY_PREFIX}${key}`)))
  )
}
