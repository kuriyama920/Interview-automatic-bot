/**
 * Supabase クライアント ファクトリ
 * Workers はリクエストごとにステートレスなので、env から生成
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Env } from '../types'

/**
 * Supabase Admin クライアントを生成
 */
export function createSupabaseAdmin(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
