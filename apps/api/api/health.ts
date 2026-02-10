/**
 * ヘルスチェックエンドポイント
 * GET /api/health
 */

import { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
  const envChecks = {
    // Phase 5: 基本認証・DB
    hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    // Phase 6: Embeddings
    hasOpenaiKey: !!process.env.OPENAI_API_KEY,
    // Phase 7: Stripe 決済
    hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
    hasStripeWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasCronSecret: !!process.env.CRON_SECRET,
    // Phase 8: API プロキシ
    hasDeepgramKey: !!process.env.DEEPGRAM_API_KEY,
  }

  const allSet = Object.values(envChecks).every(Boolean)

  res.status(200).json({
    status: allSet ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    env: envChecks,
  })
}
