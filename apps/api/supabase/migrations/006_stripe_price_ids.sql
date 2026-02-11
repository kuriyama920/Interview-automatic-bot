-- Phase 7: Stripe Price ID の設定

-- Pro プラン (¥2,980/月)
UPDATE public.subscription_plans
SET stripe_price_id_monthly = 'price_1SzYTIEFLs3ImTfQeP6B8cbR'
WHERE id = 'pro';

-- Max プラン (¥14,800/月)
-- 注意: この時点では id = 'enterprise'（008 で max にリネーム）
UPDATE public.subscription_plans
SET stripe_price_id_monthly = 'price_1SzYTIEFLs3ImTfQyysjYrWQ'
WHERE id IN ('enterprise', 'max');

-- Free プランは Stripe Price ID 不要（無料のため）
