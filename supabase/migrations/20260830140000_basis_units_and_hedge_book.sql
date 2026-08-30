-- Two changes, deliberately in one migration so basis_entries isn't altered twice.
--
-- 1. UNITS FIX (bug). basis_entries stored cash_price, futures_price and basis
--    as bare numbers with no record of what unit they were in. CBOT quote
--    conventions vary per commodity and are not normalized in the price
--    pipeline — verified against real snapshot values on 2026-08-30: corn
--    550.75 (cents/bu), soybean meal 350.40 (USD/short ton), soybean oil
--    70.95 (cents/lb). A European trader quoting EUR/tonne against those
--    produced a meaningless basis. Every row now records the unit it is
--    expressed in, plus the FX rate used when the unit is EUR-denominated, so
--    a stored basis is self-describing and auditable after the fact.
--
-- 2. HEDGE BOOK (v3). The merchandiser workflow the Basis Tracker only half
--    covered: buy physical, sell futures against it, carry basis risk until
--    both legs unwind. A basis entry is an *observation*; a hedged position is
--    a *commitment* with two legs and a hedge ratio, which is why this is a
--    separate table rather than more columns on basis_entries.

-- ── 1. Units on basis_entries ────────────────────────────────────────────

ALTER TABLE public.basis_entries
  -- 'native' | 'USD/bu' | 'USD/t' | 'EUR/t'. Defaults to 'native' so the rows
  -- written before this migration keep their original (raw-quote) meaning
  -- rather than being silently reinterpreted as something else.
  ADD COLUMN price_unit TEXT NOT NULL DEFAULT 'native',
  -- USD->EUR rate applied at entry time; NULL unless price_unit is EUR-based.
  -- Stored rather than re-derived because ECB rates move daily and a
  -- historical basis must stay reproducible.
  ADD COLUMN fx_rate NUMERIC(12,6);

ALTER TABLE public.basis_entries
  ADD CONSTRAINT basis_entries_price_unit_valid
    CHECK (price_unit IN ('native', 'USD/bu', 'USD/t', 'EUR/t'));

-- A EUR-denominated row without the rate used is not auditable, and a
-- non-EUR row carrying one is misleading.
ALTER TABLE public.basis_entries
  ADD CONSTRAINT basis_entries_fx_rate_presence
    CHECK (
      (price_unit = 'EUR/t' AND fx_rate IS NOT NULL AND fx_rate > 0)
      OR (price_unit <> 'EUR/t' AND fx_rate IS NULL)
    );

-- ── 2. Hedge book ────────────────────────────────────────────────────────

CREATE TABLE public.hedged_positions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  commodity_name TEXT NOT NULL,
  location TEXT NOT NULL,

  -- Physical leg. 'long' = bought/own the physical (the classic elevator
  -- position, hedged by selling futures); 'short' = sold physical forward
  -- that isn't owned yet, hedged by buying futures.
  physical_side TEXT NOT NULL,
  physical_quantity NUMERIC(16,4) NOT NULL CHECK (physical_quantity > 0),
  -- 'tonne' | 'bushel' | 'short-ton' — the unit the physical quantity is in,
  -- which is NOT inferable from the commodity (a Dutch trader books corn in
  -- tonnes, a US elevator in bushels).
  physical_unit TEXT NOT NULL,
  cash_price NUMERIC(12,4) NOT NULL,

  -- Futures leg. Lots, not tonnes — this is how a hedge is actually placed,
  -- and converting to physical units needs the contract size, which lives in
  -- the app's commodity mappings rather than here.
  futures_contract_month TEXT,
  futures_lots NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK (futures_lots >= 0),
  futures_price NUMERIC(12,4),

  -- Both legs' prices are in this unit, same vocabulary as basis_entries.
  price_unit TEXT NOT NULL DEFAULT 'native',
  fx_rate NUMERIC(12,6),

  opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT hedged_positions_side_valid
    CHECK (physical_side IN ('long', 'short')),
  CONSTRAINT hedged_positions_physical_unit_valid
    CHECK (physical_unit IN ('tonne', 'bushel', 'short-ton')),
  CONSTRAINT hedged_positions_price_unit_valid
    CHECK (price_unit IN ('native', 'USD/bu', 'USD/t', 'EUR/t')),
  CONSTRAINT hedged_positions_fx_rate_presence
    CHECK (
      (price_unit = 'EUR/t' AND fx_rate IS NOT NULL AND fx_rate > 0)
      OR (price_unit <> 'EUR/t' AND fx_rate IS NULL)
    ),
  -- A position with lots but no price is unusable for any P&L or basis maths.
  CONSTRAINT hedged_positions_futures_price_present
    CHECK (futures_lots = 0 OR futures_price IS NOT NULL),
  CONSTRAINT hedged_positions_close_after_open
    CHECK (closed_date IS NULL OR closed_date >= opened_date)
);

CREATE INDEX hedged_positions_user_open_idx
  ON public.hedged_positions (user_id, closed_date, opened_date DESC);

ALTER TABLE public.hedged_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hedged_positions_deny_anon" ON public.hedged_positions
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "hedged_positions_select_own" ON public.hedged_positions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "hedged_positions_insert_own" ON public.hedged_positions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "hedged_positions_update_own" ON public.hedged_positions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "hedged_positions_delete_own" ON public.hedged_positions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_hedged_positions_updated_at
  BEFORE UPDATE ON public.hedged_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Null-safe from the start: `<>` would let a user with no profiles row through,
-- which is exactly the fail-open bug fixed in 20260830120000.
CREATE OR REPLACE FUNCTION public.enforce_hedged_positions_pro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF tier IS DISTINCT FROM 'pro' THEN
    RAISE EXCEPTION 'Hedge book requires Pro tier' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_hedged_positions_pro_trg
  BEFORE INSERT OR UPDATE ON public.hedged_positions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_hedged_positions_pro();
