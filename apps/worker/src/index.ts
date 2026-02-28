/**
 * Interview Bot API - Cloudflare Workers エントリーポイント
 *
 * Hono フレームワークで全ルートを統合。
 * Cloudflare Cron Triggers で月次使用量リセットを実行。
 */

import { Hono } from 'hono'
import type { Env, Variables } from './types'
import { corsMiddleware } from './middleware/cors'
import { createSupabaseAdmin } from './lib/supabase'

// Routes
import authRoutes from './routes/auth'
import aiRoutes from './routes/ai'
import sttRoutes from './routes/stt'
import stripeRoutes from './routes/stripe'
import documentsRoutes from './routes/documents'
import questionsRoutes from './routes/questions'
import subscriptionRoutes from './routes/subscription'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

// --- Global CORS middleware ---
app.use('/api/*', corsMiddleware)

// --- Mount routes ---
app.route('/api/auth', authRoutes)
app.route('/api/ai', aiRoutes)
app.route('/api/stt', sttRoutes)
app.route('/api/stripe', stripeRoutes)
app.route('/api/documents', documentsRoutes)
app.route('/api/questions', questionsRoutes)
app.route('/api/subscription', subscriptionRoutes)

// --- Health check ---
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// --- 404 fallback ---
app.all('*', (c) => {
  return c.json({ error: 'Not found' }, 404)
})

// --- Global error handler ---
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

// --- Cloudflare Workers export ---

export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger: 月次使用量リセット
   * wrangler.toml: crons = ["0 0 1 * *"]
   */
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const supabase = createSupabaseAdmin(env)

    try {
      const { error, count } = await supabase
        .from('profiles')
        .update({
          monthly_stt_minutes_used: 0,
          monthly_ai_tokens_used: 0,
        })
        .gte('monthly_stt_minutes_used', 0)

      if (error) {
        throw error
      }

      console.log(`[Cron] Monthly usage reset completed. Rows affected: ${count}`)

      // Webhook events cleanup (fire-and-forget)
      ctx.waitUntil(
        Promise.resolve(supabase.rpc('cleanup_old_webhook_events')).catch(() => {})
      )
    } catch (error) {
      console.error('[Cron] Usage reset error:', error)
    }
  },
}
