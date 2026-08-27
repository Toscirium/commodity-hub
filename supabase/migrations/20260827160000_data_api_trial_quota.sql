-- Free-trial daily quota for Data API keys belonging to non-Pro accounts.
-- Separate from data_api_usage_daily (analytics, per-resource, never
-- enforces anything) and data_api_rate_windows (ephemeral 60/min burst
-- limit, applies to everyone regardless of tier). This table exists only to
-- answer "has this non-Pro key used its free daily allowance yet" and is
-- checked+incremented atomically so concurrent requests can't blow past the
-- cap the way an unguarded read-then-write would.
CREATE TABLE public.data_api_trial_quota (
  key_id UUID NOT NULL REFERENCES public.data_api_keys(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day)
);
ALTER TABLE public.data_api_trial_quota ENABLE ROW LEVEL SECURITY; -- no policies: only the SECURITY DEFINER function below touches this
REVOKE ALL ON public.data_api_trial_quota FROM anon, authenticated;

-- Same atomic-UPSERT-increment shape as data_api_increment_rate — one
-- statement per row, so concurrent callers on the same key serialize
-- correctly instead of racing on a read-then-write.
CREATE OR REPLACE FUNCTION public.data_api_increment_trial_quota(p_key_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.data_api_trial_quota (key_id, day, request_count)
  VALUES (p_key_id, (now() AT TIME ZONE 'utc')::date, 1)
  ON CONFLICT (key_id, day)
  DO UPDATE SET request_count = public.data_api_trial_quota.request_count + 1
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.data_api_increment_trial_quota(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_api_increment_trial_quota(UUID) TO service_role;
