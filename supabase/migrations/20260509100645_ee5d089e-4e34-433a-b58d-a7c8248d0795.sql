CREATE TABLE IF NOT EXISTS public.commodity_price_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  commodity_name text NOT NULL,
  price numeric NOT NULL,
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commodity_name, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_commodity_price_snapshots_lookup
  ON public.commodity_price_snapshots (commodity_name, snapshot_date DESC);

ALTER TABLE public.commodity_price_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "snapshots_deny_anon"
  ON public.commodity_price_snapshots
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "snapshots_deny_authenticated"
  ON public.commodity_price_snapshots
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);