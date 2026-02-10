/**
 * ヘルスチェックエンドポイント
 * GET /api/health
 */

import { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  // 環境変数チェック（内部判定のみ、詳細は非公開）
  const requiredEnvVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'JWT_SECRET',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'CRON_SECRET',
    'DEEPGRAM_API_KEY',
  ]

  const allSet = requiredEnvVars.every((key) => !!process.env[key])

  res.status(200).json({
    status: allSet ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
  })
}
