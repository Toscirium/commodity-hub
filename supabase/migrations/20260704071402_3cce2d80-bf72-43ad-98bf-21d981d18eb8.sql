
CREATE TABLE public.commodity_history_snapshots (
  commodity_name text NOT NULL,
  timeframe text NOT NULL,
  data jsonb NOT NULL,
  source text NOT NULL DEFAULT 'oilpriceapi',
  ohlc_available boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (commodity_name, timeframe)
);

GRANT SELECT ON public.commodity_history_snapshots TO anon;
GRANT SELECT ON public.commodity_history_snapshots TO authenticated;
GRANT ALL ON public.commodity_history_snapshots TO service_role;

ALTER TABLE public.commodity_history_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cached history"
  ON public.commodity_history_snapshots
  FOR SELECT
  USING (true);

CREATE INDEX commodity_history_snapshots_updated_at_idx
  ON public.commodity_history_snapshots (updated_at DESC);
