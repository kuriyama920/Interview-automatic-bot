-- Phase 7: プラン価格・制限の改定
-- Max（旧Enterprise）の "無制限(-1)" を廃止し、全プランに明確な上限を設定
-- 採算性分析に基づく価格調整（2026年2月）
--
-- コスト根拠:
--   Deepgram STT: $0.0077/分 (≒¥1.16/分)
--   GPT-5 Mini: 入力$0.25 / 出力$2.00 per 1Mトークン
--   Stripe手数料: 3.6% + ¥30/件
--
-- Free:       コスト最大¥39 → 体験用として許容
-- Pro ¥2,980: コスト最大¥901 → 粗利率70%
-- Max ¥14,800: コスト最大¥4,741 → 粗利率68%

-- Free プラン: 制限を縮小（赤字軽減）
UPDATE public.subscription_plans
SET
  price_monthly = 0,
  stt_minutes_monthly = 30,
  ai_tokens_monthly = 30000,
  storage_bytes_total = 52428800,   -- 50MB（据え置き）
  max_documents = 3
WHERE id = 'free';

-- Pro プラン: 価格を ¥1,980 → ¥2,980 に引き上げ
UPDATE public.subscription_plans
SET
  price_monthly = 2980,
  stt_minutes_monthly = 600,        -- 据え置き
  ai_tokens_monthly = 500000,       -- 据え置き
  storage_bytes_total = 1073741824,  -- 1GB（据え置き）
  max_documents = 50                 -- 据え置き
WHERE id = 'pro';

-- Max プラン（旧Enterprise）: "無制限" を廃止、明確な上限を設定
UPDATE public.subscription_plans
SET
  price_monthly = 14800,
  stt_minutes_monthly = 3000,         -- 50時間/月（旧: 無制限）
  ai_tokens_monthly = 5000000,        -- 500万/月（旧: 無制限）
  storage_bytes_total = 10737418240,   -- 10GB（旧: 無制限）
  max_documents = 200                  -- 200件（旧: 無制限）
WHERE id = 'enterprise';
