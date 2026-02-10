-- Phase 8: 使用量追跡のインデックス + Atomic Increment RPC
-- usage_logs テーブルのクエリパフォーマンス向上

-- ユーザー別・種類別・月別の使用量集計を高速化
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_type_month
  ON public.usage_logs(user_id, usage_type, created_at DESC);

-- profiles のサブスクリプション tier 別検索を高速化
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier
  ON public.profiles(subscription_tier);

-- Atomic Increment RPC（レースコンディション防止）
-- usage.ts の recordUsage() から呼び出される
CREATE OR REPLACE FUNCTION public.increment_column(
  table_name text,
  column_name text,
  increment_by int,
  row_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- テーブル名・カラム名のホワイトリスト検証（SQLインジェクション防止）
  IF table_name != 'profiles' THEN
    RAISE EXCEPTION 'Invalid table: %', table_name;
  END IF;

  IF column_name NOT IN (
    'monthly_stt_minutes_used',
    'monthly_ai_tokens_used',
    'monthly_storage_bytes_used'
  ) THEN
    RAISE EXCEPTION 'Invalid column: %', column_name;
  END IF;

  EXECUTE format(
    'UPDATE public.profiles SET %I = COALESCE(%I, 0) + $1 WHERE id = $2',
    column_name, column_name
  ) USING increment_by, row_id;
END;
$$;
