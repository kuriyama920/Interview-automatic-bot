/**
 * プロフィールキャッシュ（Cloudflare Workers Cache API）
 *
 * 毎リクエストのSupabaseプロフィール取得を Cache API でキャッシュして高速化。
 * TTL 5分で古いキャッシュを自動削除。
 * プロフィール更新時は invalidateProfileCache() で即座に無効化。
 */

import type { InterviewProfile } from './profile'

const PROFILE_CACHE_TTL_SEC = 300 // 5分
const PROFILE_CACHE_KEY_PREFIX = 'https://profile-cache.internal/'

type SupabaseProfileClient = any

function buildCacheKey(userId: string): Request {
  return new Request(`${PROFILE_CACHE_KEY_PREFIX}${userId}`)
}

export async function getCachedProfile(
  userId: string,
  supabase: SupabaseProfileClient,
  ctx?: ExecutionContext
): Promise<InterviewProfile | null> {
  const cache = caches.default
  const cacheKey = buildCacheKey(userId)

  const cached = await cache.match(cacheKey)
  if (cached) {
    return cached.json() as Promise<InterviewProfile | null>
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('interview_profile')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return null
  }

  const profile = data.interview_profile ?? null

  if (ctx) {
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(JSON.stringify(profile), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `max-age=${PROFILE_CACHE_TTL_SEC}`,
          },
        })
      )
    )
  }

  return profile
}

export async function invalidateProfileCache(userId: string): Promise<void> {
  const cache = caches.default
  const cacheKey = buildCacheKey(userId)
  await cache.delete(cacheKey)
}
