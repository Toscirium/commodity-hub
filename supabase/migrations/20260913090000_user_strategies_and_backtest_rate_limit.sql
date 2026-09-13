-- ============================================================
-- user_strategies: Pro users' saved custom backtest strategies
-- (uploaded/pasted JS run server-side in a QuickJS-WASM sandbox by the
-- run-strategy-backtest edge function — see supabase/functions/run-strategy-backtest)
-- ============================================================
CREATE TABLE public.user_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  code TEXT NOT NULL CHECK (char_length(code) BETWEEN 1 AND 20000),
  leg_a TEXT NOT NULL,
  leg_b TEXT NOT NULL,
  weight_a NUMERIC NOT NULL DEFAULT 1,
  weight_b NUMERIC NOT NULL DEFAULT 1,
  years INTEGER NOT NULL DEFAULT 10 CHECK (years BETWEEN 1 AND 20),
  last_run_at TIMESTAMPTZ,
  last_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_strategies_user ON public.user_strategies(user_id);

ALTER TABLE public.user_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_strategies_deny_anon"
  ON public.user_strategies AS RESTRICTIVE FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "user_strategies_select_own"
  ON public.user_strategies FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_strategies_insert_own"
  ON public.user_strategies FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_strategies_update_own"
  ON public.user_strategies FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_strategies_delete_own"
  ON public.user_strategies FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER user_strategies_updated_at
  BEFORE UPDATE ON public.user_strategies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Gate to Pro + cap saved strategies per user (defense in depth —
-- the UI/edge function already gate this to Pro, but a direct
-- REST/PostgREST insert should not bypass either restriction).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_user_strategy_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  strategy_count INTEGER;
  max_allowed CONSTANT INTEGER := 20;
BEGIN
  IF public.get_user_tier(NEW.user_id) <> 'pro' THEN
    RAISE EXCEPTION 'Custom strategy backtesting requires Pro'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO strategy_count
  FROM public.user_strategies
  WHERE user_id = NEW.user_id;

  IF strategy_count >= max_allowed THEN
    RAISE EXCEPTION 'Saved strategy limit reached (% allowed). Delete one to save a new strategy.', max_allowed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER user_strategies_enforce_limit
  BEFORE INSERT ON public.user_strategies
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_strategy_limit();

-- ============================================================
-- strategy_backtest_rate_windows: atomic per-user rate limit for
-- run-strategy-backtest, same shape as data_api_rate_windows
-- (see 20260817150000_data_api_rate_limit_hardening.sql) — an atomic
-- UPSERT-increment rather than a plain COUNT, since concurrent requests
-- reading the same "count so far" before either commits would let a
-- burst slip past a plain-COUNT check. Sandboxed strategy execution is
-- meaningfully more CPU-expensive per request than a chat message or a
-- data-api call, so this warrants the stronger guarantee from day one.
-- ============================================================
CREATE TABLE public.strategy_backtest_rate_windows (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, window_start)
);
ALTER TABLE public.strategy_backtest_rate_windows ENABLE ROW LEVEL SECURITY; -- no policies: only the SECURITY DEFINER function below touches this
REVOKE ALL ON public.strategy_backtest_rate_windows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.strategy_backtest_increment_rate(p_user_id UUID, p_window_start TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.strategy_backtest_rate_windows WHERE user_id = p_user_id AND window_start < now() - interval '30 minutes';
  INSERT INTO public.strategy_backtest_rate_windows (user_id, window_start, request_count)
  VALUES (p_user_id, p_window_start, 1)
  ON CONFLICT (user_id, window_start) DO UPDATE SET request_count = public.strategy_backtest_rate_windows.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

-- SECURITY DEFINER bypasses RLS and takes an arbitrary user_id; only the
-- edge function's service-role client may call it.
REVOKE ALL ON FUNCTION public.strategy_backtest_increment_rate(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.strategy_backtest_increment_rate(UUID, TIMESTAMPTZ) TO service_role;
