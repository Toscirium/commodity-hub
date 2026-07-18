-- ============================================================
-- price_alerts: user-defined price threshold rules
-- ============================================================
CREATE TABLE public.price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commodity_name TEXT NOT NULL,
  commodity_symbol TEXT,
  condition TEXT NOT NULL CHECK (condition IN ('above', 'below')),
  target_price NUMERIC NOT NULL CHECK (target_price > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60 CHECK (cooldown_minutes >= 5),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_alerts_user ON public.price_alerts(user_id);
CREATE INDEX idx_price_alerts_active ON public.price_alerts(is_active, commodity_name) WHERE is_active = true;

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_alerts_deny_anon"
  ON public.price_alerts AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "price_alerts_select_own"
  ON public.price_alerts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "price_alerts_insert_own"
  ON public.price_alerts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "price_alerts_update_own"
  ON public.price_alerts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "price_alerts_delete_own"
  ON public.price_alerts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER price_alerts_updated_at
  BEFORE UPDATE ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Tier-based active-alert limit enforcement
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_price_alert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count INTEGER;
  is_premium BOOLEAN;
  max_allowed INTEGER;
BEGIN
  IF NEW.is_active = false THEN
    RETURN NEW;
  END IF;

  SELECT (subscription_active AND subscription_tier <> 'free')
    INTO is_premium
  FROM public.profiles WHERE id = NEW.user_id;

  max_allowed := CASE WHEN COALESCE(is_premium, false) THEN 50 ELSE 1 END;

  SELECT COUNT(*) INTO active_count
  FROM public.price_alerts
  WHERE user_id = NEW.user_id
    AND is_active = true
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF active_count >= max_allowed THEN
    RAISE EXCEPTION 'Active alert limit reached (% allowed on your tier). Upgrade to Premium for 50 alerts.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER price_alerts_enforce_limit
  BEFORE INSERT OR UPDATE OF is_active ON public.price_alerts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_price_alert_limit();

-- ============================================================
-- price_alert_triggers: history of fires
-- ============================================================
CREATE TABLE public.price_alert_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES public.price_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commodity_name TEXT NOT NULL,
  condition TEXT NOT NULL,
  target_price NUMERIC NOT NULL,
  triggered_price NUMERIC NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX idx_alert_triggers_user_recent ON public.price_alert_triggers(user_id, triggered_at DESC);
CREATE INDEX idx_alert_triggers_undismissed ON public.price_alert_triggers(user_id, dismissed_at) WHERE dismissed_at IS NULL;

ALTER TABLE public.price_alert_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_triggers_deny_anon"
  ON public.price_alert_triggers AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "alert_triggers_select_own"
  ON public.price_alert_triggers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can only dismiss (update dismissed_at), not edit other fields. We enforce in app code.
CREATE POLICY "alert_triggers_update_dismiss_own"
  ON public.price_alert_triggers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- INSERT is intentionally not granted to authenticated; only service role (edge function) writes.