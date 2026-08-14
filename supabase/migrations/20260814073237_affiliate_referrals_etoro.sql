-- eToro is the only live affiliate partner now (Capital.com and Kalshi never
-- shipped a configured referral link — see src/config/affiliates.ts). The
-- original CHECK constraint only allowed 'capital_com'/'kalshi', so every
-- eToro click has been silently failing to insert since TradeCTA started
-- sending 'etoro'. Widen the constraint to admit it; capital_com/kalshi stay
-- allowed too so any historical rows (or a future re-added partner) don't
-- need a follow-up migration.
ALTER TABLE public.affiliate_referral_clicks
  DROP CONSTRAINT affiliate_referral_clicks_provider_check;

ALTER TABLE public.affiliate_referral_clicks
  ADD CONSTRAINT affiliate_referral_clicks_provider_check
  CHECK (provider IN ('etoro', 'capital_com', 'kalshi'));
