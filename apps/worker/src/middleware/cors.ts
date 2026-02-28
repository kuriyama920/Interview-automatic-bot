/**
 * CORS ミドルウェア
 * Electron アプリとWebからの安全なアクセスを許可
 */

import { cors } from 'hono/cors'
import { ALLOWED_ORIGINS } from '../lib/allowed-origins'

export const corsMiddleware = cors({
  origin: (origin) => {
    // Electronアプリ（originがnull/空）の場合
    if (!origin) return '*'

    // 明示的な許可リスト
    if ((ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
      return origin
    }

    // Cloudflare Pagesプレビューデプロイメント
    try {
      const hostname = new URL(origin).hostname
      if (
        hostname.endsWith('.pages.dev') &&
        hostname.includes('interview-bot')
      ) {
        return origin
      }
    } catch {
      // invalid URL
    }

    return null as unknown as string
  },
  allowMethods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 86400,
  credentials: true,
})
