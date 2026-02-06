-- Add session_id column to oauth_states for polling-based auth flow
ALTER TABLE public.oauth_states
ADD COLUMN session_id TEXT;

CREATE INDEX idx_oauth_states_session_id ON public.oauth_states(session_id);

COMMENT ON COLUMN public.oauth_states.session_id IS 'ポーリング認証フロー用のセッションID。NULLの場合はDeep Linkフローを使用。';
