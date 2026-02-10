-- Web チェックアウトフロー用: auth_sessions に return_url カラムを追加
-- OAuth完了後、Webアプリにリダイレクトするための URL を保存
-- NULL の場合は従来の Electron フロー（HTML成功ページ表示）

ALTER TABLE public.auth_sessions
ADD COLUMN IF NOT EXISTS return_url TEXT;

COMMENT ON COLUMN public.auth_sessions.return_url IS
  'Web checkout flow: OAuth完了後のリダイレクト先URL。NULLの場合はElectronフロー。';
