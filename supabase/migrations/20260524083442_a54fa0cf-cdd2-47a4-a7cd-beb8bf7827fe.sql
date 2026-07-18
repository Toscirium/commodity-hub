
-- Tier 1 Pro Features schema additions

-- 1. user_spreads
CREATE TABLE public.user_spreads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  formula JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_spreads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_spreads_deny_anon" ON public.user_spreads AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "user_spreads_select_own" ON public.user_spreads FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_spreads_insert_own" ON public.user_spreads FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_spreads_update_own" ON public.user_spreads FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_spreads_delete_own" ON public.user_spreads FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER update_user_spreads_updated_at BEFORE UPDATE ON public.user_spreads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_user_spreads_pro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF tier <> 'pro' THEN
    RAISE EXCEPTION 'Custom spreads require Pro tier' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_user_spreads_pro_trg BEFORE INSERT OR UPDATE ON public.user_spreads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_spreads_pro();

-- 2. cot_reports
CREATE TABLE public.cot_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity TEXT NOT NULL,
  report_date DATE NOT NULL,
  managed_money_long BIGINT NOT NULL DEFAULT 0,
  managed_money_short BIGINT NOT NULL DEFAULT 0,
  commercials_long BIGINT NOT NULL DEFAULT 0,
  commercials_short BIGINT NOT NULL DEFAULT 0,
  net_position BIGINT NOT NULL DEFAULT 0,
  open_interest BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commodity, report_date)
);
CREATE INDEX cot_reports_commodity_date_idx ON public.cot_reports (commodity, report_date DESC);
ALTER TABLE public.cot_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cot_reports_select_authenticated" ON public.cot_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "cot_reports_deny_anon" ON public.cot_reports AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- 3. watchlists + items
CREATE TABLE public.watchlists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'My Watchlist',
  color TEXT NOT NULL DEFAULT 'blue',
  is_default BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX watchlists_user_id_idx ON public.watchlists (user_id);
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlists_deny_anon" ON public.watchlists AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "watchlists_select_own" ON public.watchlists FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "watchlists_insert_own" ON public.watchlists FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "watchlists_update_own" ON public.watchlists FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "watchlists_delete_own" ON public.watchlists FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE TRIGGER update_watchlists_updated_at BEFORE UPDATE ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.watchlist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  watchlist_id UUID NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  commodity_name TEXT NOT NULL,
  commodity_symbol TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, commodity_name)
);
CREATE INDEX watchlist_items_watchlist_idx ON public.watchlist_items (watchlist_id, position);
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_items_deny_anon" ON public.watchlist_items AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "watchlist_items_select_own" ON public.watchlist_items FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "watchlist_items_insert_own" ON public.watchlist_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "watchlist_items_update_own" ON public.watchlist_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "watchlist_items_delete_own" ON public.watchlist_items FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_watchlist_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT; max_allowed INT; current_count INT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  max_allowed := CASE tier WHEN 'pro' THEN 2147483647 WHEN 'premium' THEN 5 ELSE 1 END;
  SELECT COUNT(*) INTO current_count FROM public.watchlists
    WHERE user_id = NEW.user_id AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Watchlist limit reached (% allowed on your tier). Upgrade for more.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_watchlist_limit_trg BEFORE INSERT ON public.watchlists
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watchlist_limit();

CREATE OR REPLACE FUNCTION public.enforce_watchlist_items_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT; max_allowed INT; current_count INT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  max_allowed := CASE tier WHEN 'pro' THEN 2147483647 WHEN 'premium' THEN 20 ELSE 5 END;
  SELECT COUNT(*) INTO current_count FROM public.watchlist_items
    WHERE watchlist_id = NEW.watchlist_id AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Items per watchlist limit reached (% allowed on your tier). Upgrade for more.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_watchlist_items_limit_trg BEFORE INSERT ON public.watchlist_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_watchlist_items_limit();

-- 4. Extend price_alerts
ALTER TABLE public.price_alerts
  ADD COLUMN alert_type TEXT NOT NULL DEFAULT 'price',
  ADD COLUMN config JSONB;
ALTER TABLE public.price_alerts ALTER COLUMN condition DROP NOT NULL;
ALTER TABLE public.price_alerts ALTER COLUMN target_price DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_price_alert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF NEW.alert_type = 'pct_move' AND tier = 'free' THEN
    RAISE EXCEPTION 'Percent move alerts require Premium tier' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.alert_type IN ('volatility_band','spread','news_keyword') AND tier <> 'pro' THEN
    RAISE EXCEPTION 'Smart alerts (volatility, spread, news) require Pro tier' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.alert_type NOT IN ('price','pct_move','volatility_band','spread','news_keyword') THEN
    RAISE EXCEPTION 'Unknown alert_type' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.alert_type = 'price' THEN
    IF NEW.condition IS NULL OR NEW.target_price IS NULL THEN
      RAISE EXCEPTION 'Price alerts need condition and target_price' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.config IS NULL THEN
      RAISE EXCEPTION 'Smart alerts need a config object' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_price_alert_trg BEFORE INSERT OR UPDATE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.validate_price_alert();
