CREATE TABLE public.pro_analytics_cache (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pro_analytics_cache TO authenticated;
GRANT ALL ON public.pro_analytics_cache TO service_role;

ALTER TABLE public.pro_analytics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Pro users can read analytics cache"
ON public.pro_analytics_cache
FOR SELECT
TO authenticated
USING (public.get_user_tier(auth.uid()) = 'pro');

CREATE INDEX idx_pro_analytics_cache_updated ON public.pro_analytics_cache(updated_at DESC);