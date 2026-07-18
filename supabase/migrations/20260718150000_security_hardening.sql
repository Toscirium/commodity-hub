-- Durable server-side controls for paid AI usage and billing webhooks.

CREATE TABLE public.ai_usage_windows (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start DATE NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE public.ai_usage_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_windows FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ai_request_quota(_user_id UUID, _limit INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used INTEGER;
BEGIN
  IF _limit < 1 OR _limit > 500 THEN
    RAISE EXCEPTION 'Invalid AI quota limit';
  END IF;

  INSERT INTO public.ai_usage_windows (user_id, window_start, request_count)
  VALUES (_user_id, CURRENT_DATE, 1)
  ON CONFLICT (user_id, window_start) DO UPDATE
    SET request_count = public.ai_usage_windows.request_count + 1,
        updated_at = now()
    WHERE public.ai_usage_windows.request_count < _limit
  RETURNING request_count INTO used;

  RETURN used IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_request_quota(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_request_quota(UUID, INTEGER) TO service_role;

CREATE TABLE public.billing_webhook_events (
  provider_event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'revenuecat',
  user_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_webhook_events FROM anon, authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_event_at TIMESTAMPTZ;
