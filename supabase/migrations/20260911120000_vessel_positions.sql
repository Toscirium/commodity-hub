-- Live AIS-derived vessel positions near major commodity shipping chokepoints
-- (Strait of Hormuz, Suez Canal, Bab-el-Mandeb, Strait of Malacca/Singapore,
-- Panama Canal, Bosphorus, Strait of Gibraltar, US Gulf Coast). Populated by
-- the fetch-vessel-positions edge function via AISStream.io
-- (wss://stream.aisstream.io/v0/stream) on a 1-minute pg_cron schedule --
-- see docs/VESSEL_TRACKING_SETUP.md.
--
-- One row per vessel (by MMSI) -- this is a live snapshot table, not a
-- history table. AIS transponders send PositionReport messages often but
-- ShipStaticData (name, type, destination) rarely, and either kind can
-- arrive first for a given vessel. fetch-vessel-positions upserts each kind
-- as its own batch containing only the columns that message type actually
-- carries, so one never overwrites the other half of a row with nulls.
CREATE TABLE public.vessel_positions (
  mmsi BIGINT NOT NULL PRIMARY KEY,
  ship_name TEXT,
  -- Raw AIS "Type" code (see ITU-R M.1371) from ShipStaticData, e.g. 80-89 =
  -- tanker, 70-79 = cargo. Decoded to a human category in the frontend
  -- (src/utils/aisShipType.ts) rather than duplicated here.
  ship_type SMALLINT,
  destination TEXT,
  -- Which of our subscribed bounding boxes this vessel was last seen in --
  -- see CHOKEPOINTS in fetch-vessel-positions/index.ts (keep in sync with
  -- src/pages/VesselTracker.tsx, which draws the same boxes on the map).
  region TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  sog NUMERIC, -- speed over ground, knots
  cog NUMERIC, -- course over ground, degrees
  true_heading SMALLINT,
  nav_status SMALLINT, -- AIS nav status code, e.g. 0 = under way using engine
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vessel_positions_region_idx ON public.vessel_positions (region);
CREATE INDEX vessel_positions_updated_at_idx ON public.vessel_positions (updated_at DESC);

ALTER TABLE public.vessel_positions ENABLE ROW LEVEL SECURITY;

-- Shared live data, same shape as cot_reports: any signed-in user can read
-- it (the Vessel Tracker page itself gates on the Pro tier in the UI), only
-- the service role (used by fetch-vessel-positions) can write it.
CREATE POLICY "vessel_positions_select_authenticated" ON public.vessel_positions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vessel_positions_deny_anon" ON public.vessel_positions
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
