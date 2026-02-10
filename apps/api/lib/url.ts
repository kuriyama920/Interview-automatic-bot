/**
 * URL ユーティリティ
 * リクエストからベースURLを取得する共通関数
 */

import { VercelRequest } from '@vercel/node'

export function getBaseUrl(req: VercelRequest): string {
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL
  }
  const protocol = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host
  return `${protocol}://${host}`
}
