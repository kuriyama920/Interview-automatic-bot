/**
 * CORS ミドルウェア
 * Electron アプリとWebからの安全なアクセスを許可
 */

import { cors } from 'hono/cors'
import { ALLOWED_ORIGINS } from '../lib/allowed-origins'

export const corsMiddleware = cors({
  origin: (origin) => {
    // 'null' origin はサンドボックスiframeからの攻撃を示すため拒否
    // （Electronのoriginなしリクエストは !origin で判定し、'*'を返す）
    if (origin === 'null') return null as unknown as string

    // originなしのリクエスト（Electron mainプロセス / Node.js fetch）:
    // credentials: true と '*' の組み合わせはブラウザが拒否するが、
    // 防御の深層化として Worker 自身の URL を返す
    if (!origin) return 'https://interview-bot-api.interviewautomaticbot92.workers.dev'

    // 明示的な許可リスト
    if ((ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
      return origin
    }

    // Cloudflare Pagesプレビューデプロイメント
    try {
      const hostname = new URL(origin).hostname
      if (hostname.endsWith('.interview-bot-web.pages.dev')) {
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
