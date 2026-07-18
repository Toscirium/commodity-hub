
-- ============================================================
-- Portfolios table
-- ============================================================
CREATE TABLE public.portfolios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_portfolios_user ON public.portfolios(user_id);
CREATE UNIQUE INDEX idx_portfolios_one_default
  ON public.portfolios(user_id) WHERE is_default = true;

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY portfolios_deny_anon ON public.portfolios
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

CREATE POLICY portfolios_select_own ON public.portfolios
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY portfolios_insert_own ON public.portfolios
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY portfolios_update_own ON public.portfolios
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY portfolios_delete_own ON public.portfolios
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Tier helpers
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_tier(_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN subscription_active AND subscription_tier = 'pro' THEN 'pro'
    WHEN subscription_active AND subscription_tier = 'premium' THEN 'premium'
    ELSE 'free'
  END
  FROM public.profiles WHERE id = _user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_tier(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_tier(UUID) TO authenticated;

-- ============================================================
-- Portfolio limit trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_portfolio_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  tier TEXT;
  max_allowed INTEGER;
  current_count INTEGER;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  max_allowed := CASE tier
    WHEN 'pro' THEN 2147483647
    WHEN 'premium' THEN 3
    ELSE 1
  END;

  SELECT COUNT(*) INTO current_count
  FROM public.portfolios
  WHERE user_id = NEW.user_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Portfolio limit reached (% allowed on your tier). Upgrade for more.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_portfolio_limit() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_enforce_portfolio_limit
  BEFORE INSERT ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.enforce_portfolio_limit();

-- ============================================================
-- Update price alert limit to three tiers
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_price_alert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  active_count INTEGER;
  tier TEXT;
  max_allowed INTEGER;
BEGIN
  IF NEW.is_active = false THEN
    RETURN NEW;
  END IF;

  tier := public.get_user_tier(NEW.user_id);
  max_allowed := CASE tier
    WHEN 'pro' THEN 50
    WHEN 'premium' THEN 10
    ELSE 1
  END;

  SELECT COUNT(*) INTO active_count
  FROM public.price_alerts
  WHERE user_id = NEW.user_id
    AND is_active = true
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF active_count >= max_allowed THEN
    RAISE EXCEPTION 'Active alert limit reached (% allowed on your tier). Upgrade for more.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- portfolio_positions.portfolio_id
-- ============================================================
ALTER TABLE public.portfolio_positions
  ADD COLUMN portfolio_id UUID;

-- Backfill: create a Default portfolio per user that has positions
INSERT INTO public.portfolios (user_id, name, is_default)
SELECT DISTINCT user_id, 'Default', true
FROM public.portfolio_positions
WHERE user_id NOT IN (SELECT user_id FROM public.portfolios WHERE is_default = true);

UPDATE public.portfolio_positions pp
SET portfolio_id = p.id
FROM public.portfolios p
WHERE p.user_id = pp.user_id
  AND p.is_default = true
  AND pp.portfolio_id IS NULL;

CREATE INDEX idx_portfolio_positions_portfolio ON public.portfolio_positions(portfolio_id);

-- Auto-create default portfolio + assign portfolio_id when missing
CREATE OR REPLACE FUNCTION public.ensure_default_portfolio()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  default_id UUID;
BEGIN
  IF NEW.portfolio_id IS NULL THEN
    SELECT id INTO default_id
    FROM public.portfolios
    WHERE user_id = NEW.user_id AND is_default = true
    LIMIT 1;

    IF default_id IS NULL THEN
      INSERT INTO public.portfolios (user_id, name, is_default)
      VALUES (NEW.user_id, 'Default', true)
      RETURNING id INTO default_id;
    END IF;

    NEW.portfolio_id := default_id;
  ELSE
    -- Validate the portfolio belongs to this user
    PERFORM 1 FROM public.portfolios
      WHERE id = NEW.portfolio_id AND user_id = NEW.user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid portfolio_id for this user'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_default_portfolio() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_ensure_default_portfolio
  BEFORE INSERT ON public.portfolio_positions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_default_portfolio();
