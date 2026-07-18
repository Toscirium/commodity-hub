CREATE TABLE public.fundamentals_snapshots (
  series_id TEXT PRIMARY KEY,
  dataset TEXT NOT NULL,
  label TEXT NOT NULL,
  unit TEXT,
  observations JSONB NOT NULL DEFAULT '[]'::jsonb,
  latest_value NUMERIC,
  latest_period TEXT,
  wow_change NUMERIC,
  yoy_change NUMERIC,
  five_year_avg NUMERIC,
  metadata JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fundamentals_snapshots TO authenticated;
GRANT ALL ON public.fundamentals_snapshots TO service_role;

ALTER TABLE public.fundamentals_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read fundamentals"
  ON public.fundamentals_snapshots
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_fundamentals_dataset ON public.fundamentals_snapshots(dataset);
CREATE INDEX idx_fundamentals_updated_at ON public.fundamentals_snapshots(updated_at DESC);