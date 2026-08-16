-- ============================================================
-- Broker-style position fields on portfolio_positions
--
-- Supports two new "see your eToro trades" paths (both read-only,
-- no credentials, no live broker API — see src/config/affiliates.ts
-- and .lovable/memory/index.md for why):
--   1. Manual entry of CFD-style positions (long/short, leverage)
--   2. Bulk import from an exported broker statement (CSV/XLSX)
--
-- external_id + broker together let a re-imported statement be
-- upserted idempotently instead of creating duplicate rows.
-- ============================================================

ALTER TABLE public.portfolio_positions
  ADD COLUMN side TEXT NOT NULL DEFAULT 'buy' CHECK (side IN ('buy', 'sell')),
  ADD COLUMN leverage NUMERIC(6,2) CHECK (leverage IS NULL OR leverage > 0),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  ADD COLUMN exit_price NUMERIC(15,4) CHECK (exit_price IS NULL OR exit_price >= 0),
  ADD COLUMN closed_date DATE,
  ADD COLUMN broker TEXT,
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'statement_import')),
  ADD COLUMN external_id TEXT;

COMMENT ON COLUMN public.portfolio_positions.side IS 'buy = long, sell = short (CFD direction)';
COMMENT ON COLUMN public.portfolio_positions.leverage IS 'Informational only (e.g. eToro CFD leverage) — not applied to P&L math, which already uses full exposure size';
COMMENT ON COLUMN public.portfolio_positions.broker IS 'Free-text label of the external broker this position mirrors, e.g. "eToro". Never used to connect to a real account.';
COMMENT ON COLUMN public.portfolio_positions.source IS 'manual = typed in by the user; statement_import = parsed from an uploaded broker statement';
COMMENT ON COLUMN public.portfolio_positions.external_id IS 'Broker-provided identifier (e.g. eToro Position ID) from an imported statement row, used to dedupe on re-import';

-- A closed position must record how/when it closed; an open one must not
-- carry stale close data.
ALTER TABLE public.portfolio_positions
  ADD CONSTRAINT portfolio_positions_close_fields_consistent CHECK (
    (status = 'open' AND exit_price IS NULL AND closed_date IS NULL) OR
    (status = 'closed' AND exit_price IS NOT NULL AND closed_date IS NOT NULL)
  );

-- Re-importing the same statement should update rows, not duplicate them.
-- Only enforced when external_id is present (manual entries never set it).
CREATE UNIQUE INDEX idx_portfolio_positions_user_external
  ON public.portfolio_positions (user_id, broker, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX idx_portfolio_positions_status ON public.portfolio_positions (status);
