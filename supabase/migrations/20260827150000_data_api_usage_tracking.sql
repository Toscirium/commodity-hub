-- Persistent, per-key usage analytics for the Data API product — separate
-- from data_api_rate_windows (20260817150000), which is intentionally
-- ephemeral (rows are self-deleted after 5 minutes; it exists only to
-- enforce the 60 req/min limit, not to answer "how much is this key used").
--
-- Daily granularity per (key, resource) keeps row growth trivial even at
-- real scale: a key hitting all 4 resources every day for a year is 1,460
-- rows. No purge job needed.
CREATE TABLE public.data_api_usage_daily (
  key_id UUID NOT NULL REFERENCES public.data_api_keys(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  resource TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day, resource)
);
CREATE INDEX data_api_usage_daily_day_idx ON public.data_api_usage_daily(day);
ALTER TABLE public.data_api_usage_daily ENABLE ROW LEVEL SECURITY; -- no policies: only the SECURITY DEFINER function below writes, only the admin-gated edge function reads (via service role)
REVOKE ALL ON public.data_api_usage_daily FROM anon, authenticated;

-- Atomically increments today's (key, resource) counter. Called once per
-- authorized request (i.e. after the API-key + Pro-tier + rate-limit
-- checks all pass) from data-api/index.ts.
CREATE OR REPLACE FUNCTION public.data_api_record_usage(p_key_id UUID, p_resource TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.data_api_usage_daily (key_id, day, resource, request_count)
  VALUES (p_key_id, (now() AT TIME ZONE 'utc')::date, p_resource, 1)
  ON CONFLICT (key_id, day, resource)
  DO UPDATE SET request_count = public.data_api_usage_daily.request_count + 1;
END;
$$;

-- Same reasoning as data_api_increment_rate: SECURITY DEFINER + arbitrary
-- key_id argument means this must not be PUBLIC-executable.
REVOKE ALL ON FUNCTION public.data_api_record_usage(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_api_record_usage(UUID, TEXT) TO service_role;
