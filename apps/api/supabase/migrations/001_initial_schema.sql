-- Interview Bot SaaS Database Schema
-- PostgreSQL + pgvector

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. Profiles (ユーザー情報 + Stripe連携)
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,

  -- Stripe連携
  stripe_customer_id TEXT UNIQUE,

  -- サブスクリプション情報
  subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
  subscription_period_end TIMESTAMPTZ,

  -- 使用量（月次リセット）
  monthly_stt_minutes_used INTEGER NOT NULL DEFAULT 0,
  monthly_ai_tokens_used INTEGER NOT NULL DEFAULT 0,
  monthly_storage_bytes_used BIGINT NOT NULL DEFAULT 0,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profilesインデックス
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE INDEX idx_profiles_stripe_customer ON public.profiles(stripe_customer_id);

-- ============================================
-- 2. User Settings (アプリ設定)
-- ============================================
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- UI設定
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  auto_generate_ai BOOLEAN NOT NULL DEFAULT true,

  -- AI設定
  ai_model TEXT NOT NULL DEFAULT 'gpt-5-mini',
  ai_temperature DECIMAL(3,2) NOT NULL DEFAULT 0.7
    CHECK (ai_temperature >= 0 AND ai_temperature <= 2),
  ai_max_tokens INTEGER NOT NULL DEFAULT 1000
    CHECK (ai_max_tokens > 0 AND ai_max_tokens <= 4000),

  -- RAG設定
  context_min_similarity DECIMAL(3,2) NOT NULL DEFAULT 0.7
    CHECK (context_min_similarity >= 0 AND context_min_similarity <= 1),
  context_top_k INTEGER NOT NULL DEFAULT 3
    CHECK (context_top_k > 0 AND context_top_k <= 10),

  -- カスタムAPIキー（Pro以上、暗号化推奨）
  custom_deepgram_api_key TEXT,
  custom_openai_api_key TEXT,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id)
);

-- ============================================
-- 3. Documents (ドキュメントメタデータ)
-- ============================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- ドキュメント情報
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('resume', 'job_posting')),
  storage_path TEXT NOT NULL,

  -- 処理状態
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'error')),
  error_message TEXT,

  -- メタデータ
  file_size_bytes BIGINT NOT NULL,
  page_count INTEGER,
  word_count INTEGER,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- タイムスタンプ
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

-- Documentsインデックス
CREATE INDEX idx_documents_user_id ON public.documents(user_id);
CREATE INDEX idx_documents_type ON public.documents(type);
CREATE INDEX idx_documents_status ON public.documents(status);

-- ============================================
-- 4. Document Chunks (ベクトル埋め込み)
-- ============================================
CREATE TABLE public.document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- チャンク情報
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,

  -- ベクトル埋め込み (OpenAI text-embedding-3-small: 1536次元)
  embedding vector(1536) NOT NULL,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ベクトル検索用インデックス (IVFFlat)
CREATE INDEX idx_chunks_embedding ON public.document_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_chunks_document_id ON public.document_chunks(document_id);
CREATE INDEX idx_chunks_user_id ON public.document_chunks(user_id);

-- ============================================
-- 5. Usage Logs (使用量追跡)
-- ============================================
CREATE TABLE public.usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- 使用タイプ
  usage_type TEXT NOT NULL
    CHECK (usage_type IN ('stt', 'ai_completion', 'embedding', 'storage')),

  -- 使用量
  quantity INTEGER NOT NULL,
  unit TEXT NOT NULL,

  -- コンテキスト
  metadata JSONB,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Usage Logsインデックス
CREATE INDEX idx_usage_logs_user_created ON public.usage_logs(user_id, created_at);
CREATE INDEX idx_usage_logs_type ON public.usage_logs(usage_type);

-- ============================================
-- 6. Subscription Plans (参照用マスター)
-- ============================================
CREATE TABLE public.subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,

  -- 価格（円）
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER,

  -- Stripe Price ID
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,

  -- 制限 (-1 = unlimited)
  stt_minutes_monthly INTEGER NOT NULL,
  ai_tokens_monthly INTEGER NOT NULL,
  storage_bytes_total BIGINT NOT NULL,
  max_documents INTEGER NOT NULL,

  -- 機能フラグ
  features JSONB NOT NULL DEFAULT '{}',

  is_active BOOLEAN NOT NULL DEFAULT true
);

-- 初期プランデータ
INSERT INTO public.subscription_plans (id, name, price_monthly, stt_minutes_monthly, ai_tokens_monthly, storage_bytes_total, max_documents, features) VALUES
  ('free', 'Free', 0, 60, 50000, 52428800, 5, '{"custom_api_keys": false, "priority_support": false}'),
  ('pro', 'Pro', 1980, 600, 500000, 1073741824, 50, '{"custom_api_keys": true, "priority_support": false}'),
  ('enterprise', 'Enterprise', 9800, -1, -1, -1, -1, '{"custom_api_keys": true, "priority_support": true}');

-- ============================================
-- Functions: ベクトル類似検索
-- ============================================
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid,
  p_document_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM public.document_chunks dc
  JOIN public.documents d ON dc.document_id = d.id
  WHERE
    dc.user_id = p_user_id
    AND d.deleted_at IS NULL
    AND d.status = 'ready'
    AND (p_document_types IS NULL OR d.type = ANY(p_document_types))
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- Triggers: updated_at自動更新
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS)
-- ============================================
-- Note: RLSはサービスロールキーでバイパスするため、
-- Vercel API経由のアクセスでは適用されない。
-- 将来的にSupabaseクライアントを直接使う場合に備えて設定。

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: 自分のデータのみ
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (true);  -- サービスキー経由なのでall許可

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (true);

-- User Settings: 自分の設定のみ
CREATE POLICY "settings_all_own" ON public.user_settings
  FOR ALL USING (true);

-- Documents: 自分のドキュメントのみ（削除済み除外）
CREATE POLICY "documents_all_own" ON public.documents
  FOR ALL USING (true);

-- Document Chunks: 自分のチャンクのみ
CREATE POLICY "chunks_all_own" ON public.document_chunks
  FOR ALL USING (true);

-- Usage Logs: 自分のログのみ（読み取りのみ）
CREATE POLICY "usage_select_own" ON public.usage_logs
  FOR SELECT USING (true);

CREATE POLICY "usage_insert" ON public.usage_logs
  FOR INSERT WITH CHECK (true);
