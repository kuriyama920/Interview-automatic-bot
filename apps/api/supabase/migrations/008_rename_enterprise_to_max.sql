-- Phase 7: Enterprise プランを Max プランに名称変更
-- データベース内の 'enterprise' を 'max' にリネーム

-- 1. subscription_plans テーブルの id と name を更新
UPDATE public.subscription_plans
SET id = 'max', name = 'Max'
WHERE id = 'enterprise';

-- 2. profiles テーブルの subscription_tier を更新
UPDATE public.profiles
SET subscription_tier = 'max'
WHERE subscription_tier = 'enterprise';

-- 3. CHECK 制約を更新（enterprise → max）
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'pro', 'max'));
