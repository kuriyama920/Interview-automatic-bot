/**
 * Supabase クライアント初期化
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// サーバーサイド用クライアント（RLSバイパス）
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// データベース型定義
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          avatar_url: string | null
          stripe_customer_id: string | null
          subscription_tier: 'free' | 'pro' | 'enterprise'
          subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing'
          subscription_period_end: string | null
          monthly_stt_minutes_used: number
          monthly_ai_tokens_used: number
          monthly_storage_bytes_used: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['profiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          theme: 'dark' | 'light'
          auto_generate_ai: boolean
          ai_model: string
          ai_temperature: number
          ai_max_tokens: number
          context_min_similarity: number
          context_top_k: number
          custom_deepgram_api_key: string | null
          custom_openai_api_key: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_settings']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['user_settings']['Insert']>
      }
      documents: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'resume' | 'job_posting'
          storage_path: string
          status: 'processing' | 'ready' | 'error'
          error_message: string | null
          file_size_bytes: number
          page_count: number | null
          word_count: number | null
          chunk_count: number
          total_tokens: number
          uploaded_at: string
          processed_at: string | null
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['documents']['Row'], 'uploaded_at' | 'processed_at' | 'deleted_at'>
        Update: Partial<Database['public']['Tables']['documents']['Insert']>
      }
      usage_logs: {
        Row: {
          id: string
          user_id: string
          usage_type: 'stt' | 'ai_completion' | 'embedding' | 'storage'
          quantity: number
          unit: string
          metadata: Record<string, unknown> | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['usage_logs']['Row'], 'id' | 'created_at'>
        Update: never
      }
    }
  }
}
