/**
 * 使用量チェック「拒否のみキャッシュ」
 *
 * 上限到達（拒否）結果のみを30秒キャッシュし、
 * 許可結果はキャッシュしない（レースコンディション防止）。
 *
 * Cloudflare Cache API を使用。
 */

export const DENIED_CACHE_TTL_SEC = 30

const CACHE_KEY_PREFIX = 'https://usage-denied.internal'

/**
 * キャッシュキーを構築する
 * フォーマット: https://usage-denied.internal/{userId}/{resourceType}
 */
export function buildCacheKey(userId: string, resourceType: string): Request {
  return new Request(`${CACHE_KEY_PREFIX}/${userId}/${resourceType}`)
}

/**
 * 指定ユーザー・リソースの使用量が拒否キャッシュされているか確認
 * キャッシュミスまたはエラー時は false を返す（安全側にフォールバック）
 */
export async function isUsageDenied(
  userId: string,
  resourceType: string
): Promise<boolean> {
  try {
    const cache = caches.default
    const key = buildCacheKey(userId, resourceType)
    const response = await cache.match(key)
    return response !== undefined
  } catch {
    return false
  }
}

/**
 * 拒否結果をキャッシュに書き込む
 * ExecutionContext が渡された場合は waitUntil で非同期実行する
 */
export async function cacheDeniedResult(
  userId: string,
  resourceType: string,
  ctx?: ExecutionContext
): Promise<void> {
  const key = buildCacheKey(userId, resourceType)
  const response = new Response('denied', {
    headers: {
      'Cache-Control': `max-age=${DENIED_CACHE_TTL_SEC}`,
    },
  })

  const doPut = async (): Promise<void> => {
    try {
      const cache = caches.default
      await cache.put(key, response)
    } catch {
      // キャッシュ書き込み失敗は無視（フォールバック: 毎回RPCチェック）
    }
  }

  if (ctx) {
    ctx.waitUntil(doPut())
  } else {
    await doPut()
  }
}

/**
 * 拒否キャッシュを削除する（プランアップグレード・月次リセット用）
 */
export async function clearDeniedCache(
  userId: string,
  resourceType: string
): Promise<void> {
  try {
    const cache = caches.default
    const key = buildCacheKey(userId, resourceType)
    await cache.delete(key)
  } catch {
    // キャッシュ削除失敗は無視
  }
}
