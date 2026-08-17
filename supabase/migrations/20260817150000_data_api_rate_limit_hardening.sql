-- data-api's rate limiter had the same weakness just found and fixed in
-- messaging: IpRateLimiter's counter is per-isolate in-memory, and
-- Supabase's edge runtime spins up separate isolates for concurrent
-- requests, so a burst of concurrent calls on one key barely gets limited
-- at all. Messaging's fix (a plain COUNT query) works but has a race —
-- concurrent requests can all read the same "count so far" before any of
-- them commit. This uses an atomic UPSERT-increment instead: a single
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING is one atomic statement
-- per row in Postgres, so concurrent callers serialize on it correctly
-- with no window for double-counting.

CREATE TABLE public.data_api_rate_windows (
  key_id UUID NOT NULL REFERENCES public.data_api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, window_start)
);
ALTER TABLE public.data_api_rate_windows ENABLE ROW LEVEL SECURITY; -- no policies: only the SECURITY DEFINER function below touches this
REVOKE ALL ON public.data_api_rate_windows FROM anon, authenticated;

-- Atomically increments this key's counter for the given (fixed) window and
-- returns the new count. Also opportunistically deletes this key's stale
-- windows so the table doesn't grow unbounded (no cron needed for a
-- single-minute-bucket table with modest key counts).
CREATE OR REPLACE FUNCTION public.data_api_increment_rate(p_key_id UUID, p_window_start TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.data_api_rate_windows WHERE key_id = p_key_id AND window_start < now() - interval '5 minutes';
  INSERT INTO public.data_api_rate_windows (key_id, window_start, request_count)
  VALUES (p_key_id, p_window_start, 1)
  ON CONFLICT (key_id, window_start) DO UPDATE SET request_count = public.data_api_rate_windows.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

-- SECURITY DEFINER functions default to PUBLIC-executable; this one
-- bypasses RLS and takes an arbitrary key_id, so an authenticated client
-- calling it directly could inflate or probe another key's counter.
REVOKE ALL ON FUNCTION public.data_api_increment_rate(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_api_increment_rate(UUID, TIMESTAMPTZ) TO service_role;
