/**
 * URL ユーティリティ
 * リクエストからベースURLを取得
 */

/**
 * リクエストURLからベースURLを取得
 */
export function getBaseUrl(req: Request): string {
  const url = new URL(req.url)
  return `${url.protocol}//${url.host}`
}
