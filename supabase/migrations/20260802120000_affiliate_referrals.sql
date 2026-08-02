-- Affiliate referral tracking for the "Trade" hub. Commodity Hub does not execute
-- trades, hold funds, or store broker credentials — this only logs outbound clicks
-- to independent, regulated third parties (Capital.com, Kalshi) for funnel measurement.
CREATE TABLE public.affiliate_referral_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('capital_com', 'kalshi')),
  commodity_symbol text NOT NULL,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX affiliate_referral_clicks_provider_clicked_at_idx
  ON public.affiliate_referral_clicks (provider, clicked_at DESC);

ALTER TABLE public.affiliate_referral_clicks ENABLE ROW LEVEL SECURITY;

-- Write-only from the client (including signed-out visitors): anyone can log a
-- click, nobody can read the table back — analytics are pulled via the service
-- role from a dashboard, not exposed to end users.
CREATE POLICY "Anyone can log an affiliate click" ON public.affiliate_referral_clicks
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());
