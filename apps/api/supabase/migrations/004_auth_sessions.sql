-- Auth Sessions Table
-- ポーリング認証フロー用のセッション管理

CREATE TABLE public.auth_sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  token TEXT,
  user_data JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

-- インデックス
CREATE INDEX idx_auth_sessions_status ON public.auth_sessions(status);
CREATE INDEX idx_auth_sessions_expires_at ON public.auth_sessions(expires_at);

-- 期限切れセッションをクリーンアップする関数
CREATE OR REPLACE FUNCTION cleanup_expired_auth_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM public.auth_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_sessions_all" ON public.auth_sessions
  FOR ALL USING (true);

COMMENT ON TABLE public.auth_sessions IS 'ポーリング認証フロー用のセッション。5分で期限切れ。';
