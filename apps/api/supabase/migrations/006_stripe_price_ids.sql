-- Phase 7: Stripe Price ID の設定

-- Pro プラン (¥2,980/月)
UPDATE public.subscription_plans
SET stripe_price_id_monthly = 'price_1SxvG5EQOoOtNgU2bxdJTbMr'
WHERE id = 'pro';

-- Max プラン (¥14,800/月) ※旧 Enterprise
UPDATE public.subscription_plans
SET stripe_price_id_monthly = 'price_1SxvGoEQOoOtNgU2Ac3Xx7nb'
WHERE id = 'enterprise';  -- 008_rename_enterprise_to_max.sql で max にリネーム済み

-- 年間プランを設定する場合:
-- UPDATE public.subscription_plans
-- SET stripe_price_id_yearly = 'price_REPLACE_WITH_PRO_YEARLY'
-- WHERE id = 'pro';

-- UPDATE public.subscription_plans
-- SET stripe_price_id_yearly = 'price_REPLACE_WITH_MAX_YEARLY'
-- WHERE id = 'max';

-- Free プランは Stripe Price ID 不要（無料のため）
