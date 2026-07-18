
-- 1. USDC Balances table
CREATE TABLE public.usdc_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance numeric NOT NULL DEFAULT 10000,
  frozen_balance numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usdc_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usdc_balances_select_own" ON public.usdc_balances FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "usdc_balances_insert_own" ON public.usdc_balances FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "usdc_balances_update_own" ON public.usdc_balances FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_usdc_balances_updated_at BEFORE UPDATE ON public.usdc_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Synthetic Positions table
CREATE TABLE public.synthetic_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  commodity_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price numeric NOT NULL,
  exit_price numeric,
  quantity numeric NOT NULL,
  margin_used numeric NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  unrealized_pnl numeric NOT NULL DEFAULT 0,
  realized_pnl numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.synthetic_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "synthetic_positions_select_own" ON public.synthetic_positions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "synthetic_positions_insert_own" ON public.synthetic_positions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "synthetic_positions_update_own" ON public.synthetic_positions FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "synthetic_positions_delete_own" ON public.synthetic_positions FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_synthetic_positions_user_status ON public.synthetic_positions (user_id, status);

CREATE TRIGGER update_synthetic_positions_updated_at BEFORE UPDATE ON public.synthetic_positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Synthetic Trade History table
CREATE TABLE public.synthetic_trade_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  commodity_name text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price numeric NOT NULL,
  exit_price numeric NOT NULL,
  quantity numeric NOT NULL,
  realized_pnl numeric NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.synthetic_trade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "synthetic_trade_history_select_own" ON public.synthetic_trade_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "synthetic_trade_history_insert_own" ON public.synthetic_trade_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_synthetic_trade_history_user ON public.synthetic_trade_history (user_id, closed_at DESC);
