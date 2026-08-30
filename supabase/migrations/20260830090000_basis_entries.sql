-- Basis Tracker — Pro tier.
--
-- Basis = cash price (local, physical) minus futures price (the benchmark
-- contract). Unlike everything else this app tracks, basis is NOT public
-- data — it's hyperlocal, quoted per elevator/delivery point, and normally
-- sold by specialty ag data providers (DTN, Barchart Ag) with no free feed
-- available. So this is user-entered: the trader supplies their own cash
-- price, we snapshot the live futures price alongside it (same
-- CommodityService feed the rest of the app already uses — no new data
-- source), and store both so the basis at that point in time is preserved
-- even as the market moves.
--
-- Same shape as user_spreads (Pro-tier gate via a BEFORE INSERT/UPDATE
-- trigger checking get_user_tier, not just a client-side check) — this is
-- the flagship differentiator for physical-side users, so it gets the same
-- enforcement rigor as custom spreads rather than a soft/UI-only gate.

CREATE TABLE public.basis_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  commodity_name TEXT NOT NULL,
  location TEXT NOT NULL,
  -- Free text, not a hard reference — delivery months are commodity- and
  -- exchange-specific, and there's no canonical contract-month table in
  -- this schema to key against (unlike commodity_name, which lines up with
  -- cot_reports/portfolio_positions' existing free-text convention).
  contract_month TEXT,
  cash_price NUMERIC(12,4) NOT NULL,
  -- Snapshot of the live futures price at entry time, not a live join —
  -- both prices move daily, and a saved basis entry needs to freeze what
  -- basis actually was on that date, not recompute it against today's
  -- futures price on every read.
  futures_price NUMERIC(12,4) NOT NULL,
  -- Stored rather than GENERATED ALWAYS: no other table in this schema
  -- uses a computed column (cot_reports.net_position, for comparison, is a
  -- plain stored value computed by the ingestion code) — matching that
  -- convention rather than introducing a new one for one table.
  basis NUMERIC(12,4) NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX basis_entries_user_commodity_idx
  ON public.basis_entries (user_id, commodity_name, entry_date DESC);

ALTER TABLE public.basis_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "basis_entries_deny_anon" ON public.basis_entries
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
CREATE POLICY "basis_entries_select_own" ON public.basis_entries
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "basis_entries_insert_own" ON public.basis_entries
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "basis_entries_update_own" ON public.basis_entries
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "basis_entries_delete_own" ON public.basis_entries
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_basis_entries_updated_at
  BEFORE UPDATE ON public.basis_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_basis_entries_pro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF tier <> 'pro' THEN
    RAISE EXCEPTION 'Basis tracking requires Pro tier' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_basis_entries_pro_trg
  BEFORE INSERT OR UPDATE ON public.basis_entries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_basis_entries_pro();
