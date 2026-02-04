-- OAuth State Management Table
-- CSRF対策用のOAuth stateを一時保存

CREATE TABLE public.oauth_states (
  state TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 期限切れのstateを自動削除するインデックス
CREATE INDEX idx_oauth_states_expires_at ON public.oauth_states(expires_at);

-- 期限切れのstateをクリーンアップする関数
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM public.oauth_states WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS（サービスキー経由なので全許可）
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oauth_states_all" ON public.oauth_states
  FOR ALL USING (true);
