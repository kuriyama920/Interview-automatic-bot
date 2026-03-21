/**
 * Per-user request-level rate limiter middleware
 *
 * Sliding-window rate limiting using in-memory Map.
 * Best-effort protection (resets on cold start),
 * combined with Cloudflare's built-in DDoS protection.
 */

import { createMiddleware } from 'hono/factory'
import type { Env, Variables } from '../types'

interface RateLimitEntry {
  readonly timestamps: readonly number[]
}

interface RateLimitConfig {
  readonly maxRequests: number
  readonly windowMs: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 20,
  windowMs: 60_000,
}

/** Maximum number of user entries before triggering a purge */
const MAX_STORE_SIZE = 1000

const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Reset rate limiter state (for testing)
 */
export function resetRateLimiter(): void {
  rateLimitStore.clear()
}

/**
 * Create rate limiter middleware with configurable limits
 */
export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { maxRequests, windowMs } = { ...DEFAULT_CONFIG, ...config }

  return createMiddleware<{
    Bindings: Env
    Variables: Variables
  }>(async (c, next) => {
    const payload = c.get('jwtPayload')

    // Skip rate limiting if no authenticated user (auth middleware will reject)
    if (!payload?.sub) {
      await next()
      return
    }

    const userId = payload.sub
    const now = Date.now()
    const windowStart = now - windowMs

    const existing = rateLimitStore.get(userId)
    const validTimestamps = existing
      ? existing.timestamps.filter((ts) => ts > windowStart)
      : []

    if (validTimestamps.length >= maxRequests) {
      const oldestInWindow = validTimestamps[0]
      const retryAfterMs = oldestInWindow + windowMs - now
      const retryAfterSec = Math.ceil(retryAfterMs / 1000)

      return c.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        429,
        { 'Retry-After': String(retryAfterSec) }
      )
    }

    // Record this request — validTimestamps is already a fresh array from filter()
    validTimestamps.push(now)
    rateLimitStore.set(userId, { timestamps: validTimestamps })

    // Purge stale entries when store grows too large
    if (rateLimitStore.size > MAX_STORE_SIZE) {
      for (const [key, entry] of rateLimitStore) {
        if (entry.timestamps.every((ts) => ts <= windowStart)) {
          rateLimitStore.delete(key)
        }
      }
    }

    await next()
  })
}
