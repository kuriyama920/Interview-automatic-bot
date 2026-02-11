-- Phase 8.1: 同時使用時の競合（レースコンディション）修正
-- 複数ユーザー同時使用時のデータ整合性を保証する

-- ============================================
-- 1. Atomic Usage Check & Reserve (CRITICAL)
-- 使用量チェックと予約を1トランザクションで実行
-- FOR UPDATE ロックにより、同一ユーザーへの並行リクエストを直列化
-- ============================================
CREATE OR REPLACE FUNCTION public.check_and_reserve_usage(
  p_user_id uuid,
  p_column_name text,
  p_reserve_amount int
)
RETURNS TABLE (
  allowed boolean,
  used_amount int,
  limit_amount int,
  remaining_amount int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current int;
  v_limit int;
  v_tier text;
BEGIN
  -- カラム名のホワイトリスト検証 + 静的SQLで使用量取得（動的SQLを排除）
  IF p_column_name = 'monthly_stt_minutes_used' THEN
    SELECT COALESCE(monthly_stt_minutes_used, 0), subscription_tier
    INTO v_current, v_tier
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  ELSIF p_column_name = 'monthly_ai_tokens_used' THEN
    SELECT COALESCE(monthly_ai_tokens_used, 0), subscription_tier
    INTO v_current, v_tier
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Invalid column: %', p_column_name;
  END IF;

  IF v_tier IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- プランの上限を取得
  IF p_column_name = 'monthly_stt_minutes_used' THEN
    SELECT stt_minutes_monthly INTO v_limit
    FROM public.subscription_plans WHERE id = v_tier;
  ELSE
    SELECT ai_tokens_monthly INTO v_limit
    FROM public.subscription_plans WHERE id = v_tier;
  END IF;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Plan not found: %', v_tier;
  END IF;

  -- 上限チェック（-1 = 無制限）
  -- FOR UPDATE ロックにより、この関数の実行中は同一ユーザーの
  -- 他のリクエストはロック解放まで待機するため、レースコンディションなし
  IF v_limit != -1 AND v_current >= v_limit THEN
    RETURN QUERY SELECT false, v_current, v_limit, 0;
    RETURN;
  END IF;

  -- 予約: カウンターをアトミックにインクリメント（同一トランザクション内）
  IF p_reserve_amount > 0 THEN
    IF p_column_name = 'monthly_stt_minutes_used' THEN
      UPDATE public.profiles
      SET monthly_stt_minutes_used = COALESCE(monthly_stt_minutes_used, 0) + p_reserve_amount
      WHERE id = p_user_id;
    ELSE
      UPDATE public.profiles
      SET monthly_ai_tokens_used = COALESCE(monthly_ai_tokens_used, 0) + p_reserve_amount
      WHERE id = p_user_id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    true,
    v_current,
    v_limit,
    CASE WHEN v_limit = -1 THEN v_limit
         ELSE GREATEST(0, v_limit - v_current - p_reserve_amount)
    END;
  RETURN;
END;
$$;

-- ============================================
-- 2. Adjust Reserved Usage
-- 予約量と実際の使用量の差分を調整
-- ストリーミング完了後に予約を実績値に修正
-- ============================================
CREATE OR REPLACE FUNCTION public.adjust_reserved_usage(
  p_user_id uuid,
  p_column_name text,
  p_reserved_amount int,
  p_actual_amount int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_diff int;
BEGIN
  IF p_column_name NOT IN ('monthly_stt_minutes_used', 'monthly_ai_tokens_used') THEN
    RAISE EXCEPTION 'Invalid column: %', p_column_name;
  END IF;

  v_diff := p_reserved_amount - p_actual_amount;

  IF v_diff = 0 THEN
    RETURN;
  END IF;

  -- 静的SQLで更新（カラム名に応じて分岐）
  IF p_column_name = 'monthly_stt_minutes_used' THEN
    IF v_diff > 0 THEN
      UPDATE public.profiles
      SET monthly_stt_minutes_used = GREATEST(0, COALESCE(monthly_stt_minutes_used, 0) - v_diff)
      WHERE id = p_user_id;
    ELSE
      UPDATE public.profiles
      SET monthly_stt_minutes_used = COALESCE(monthly_stt_minutes_used, 0) + ABS(v_diff)
      WHERE id = p_user_id;
    END IF;
  ELSE
    IF v_diff > 0 THEN
      UPDATE public.profiles
      SET monthly_ai_tokens_used = GREATEST(0, COALESCE(monthly_ai_tokens_used, 0) - v_diff)
      WHERE id = p_user_id;
    ELSE
      UPDATE public.profiles
      SET monthly_ai_tokens_used = COALESCE(monthly_ai_tokens_used, 0) + ABS(v_diff)
      WHERE id = p_user_id;
    END IF;
  END IF;
END;
$$;

-- ============================================
-- 3. Atomic Stripe Customer ID 設定 (HIGH)
-- stripe_customer_id が NULL の場合のみ設定
-- ============================================
CREATE OR REPLACE FUNCTION public.set_stripe_customer_id(
  p_user_id uuid,
  p_stripe_customer_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result text;
BEGIN
  -- stripe_customer_id が NULL の場合のみ更新
  UPDATE public.profiles
  SET stripe_customer_id = p_stripe_customer_id
  WHERE id = p_user_id AND stripe_customer_id IS NULL
  RETURNING stripe_customer_id INTO v_result;

  -- 更新成功（自分がセットした）
  IF v_result IS NOT NULL THEN
    RETURN v_result;
  END IF;

  -- 別のリクエストが先にセットしていた場合、既存値を返す
  SELECT stripe_customer_id INTO v_result
  FROM public.profiles WHERE id = p_user_id;

  RETURN v_result;
END;
$$;

-- ============================================
-- 4. Webhook Event Deduplication Table (MEDIUM)
-- Stripe Webhook の重複処理を防止
-- ============================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30日以上前のイベントを自動クリーンアップ用インデックス
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at
  ON public.webhook_events(processed_at);

-- クリーンアップ関数
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_events()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.webhook_events WHERE processed_at < NOW() - INTERVAL '30 days';
END;
$$;

-- ============================================
-- 5. Atomic Auth Session Consumption (LOW)
-- セッションの取得と削除を1操作で実行
-- ============================================
CREATE OR REPLACE FUNCTION public.consume_auth_session(p_session_id text)
RETURNS TABLE (
  session_status text,
  session_token text,
  session_user_data jsonb,
  session_error text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  DELETE FROM public.auth_sessions s
  WHERE s.id = p_session_id
    AND s.status = 'completed'
    AND s.expires_at > NOW()
  RETURNING s.status, s.token, s.user_data, s.error;
END;
$$;

-- ============================================
-- 6. Upsert User Profile 関数 (MEDIUM)
-- メールアドレスの UNIQUE 制約違反を防止
-- ============================================
CREATE OR REPLACE FUNCTION public.upsert_user_profile(
  p_email text,
  p_display_name text,
  p_avatar_url text
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result public.profiles;
BEGIN
  -- INSERT を試行、競合時は UPDATE
  INSERT INTO public.profiles (
    id, email, display_name, avatar_url,
    subscription_tier, subscription_status,
    monthly_stt_minutes_used, monthly_ai_tokens_used, monthly_storage_bytes_used
  ) VALUES (
    gen_random_uuid(), p_email, p_display_name, p_avatar_url,
    'free', 'active', 0, 0, 0
  )
  ON CONFLICT (email) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
