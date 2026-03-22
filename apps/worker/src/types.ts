import type { SupabaseClient } from '@supabase/supabase-js'
import type { JWTPayload } from './lib/auth'

/**
 * Cloudflare Workers 環境変数 Bindings
 */
export type Env = {
  // Google OAuth
  GOOGLE_CLIENT_ID: string
  GOOGLE_CLIENT_SECRET: string

  // JWT
  JWT_SECRET: string

  // Supabase
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string

  // OpenAI
  OPENAI_API_KEY: string

  // Stripe
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string

  // Cron
  CRON_SECRET: string

  // Soniox
  SONIOX_API_KEY: string

  // Cloudflare AI Gateway (Optional)
  CF_ACCOUNT_ID?: string
  CF_AI_GATEWAY_ID?: string
}

/**
 * Hono Context Variables
 */
export type Variables = {
  supabase: SupabaseClient
  jwtPayload: JWTPayload
}
