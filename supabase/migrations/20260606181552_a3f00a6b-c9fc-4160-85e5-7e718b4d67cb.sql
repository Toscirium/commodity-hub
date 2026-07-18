CREATE TABLE public.analytics_snapshots (
  kind text NOT NULL,
  key  text NOT NULL,
  payload jsonb NOT NULL,
  as_of timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, key)
);

GRANT SELECT ON public.analytics_snapshots TO authenticated;
GRANT ALL    ON public.analytics_snapshots TO service_role;

ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read snapshots" ON public.analytics_snapshots
  FOR SELECT TO authenticated USING (true);