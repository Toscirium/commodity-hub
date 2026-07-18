-- wallet_connections table
CREATE TABLE public.wallet_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  wallet_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, wallet_address, chain_id)
);

CREATE INDEX idx_wallet_connections_user_id ON public.wallet_connections(user_id);
CREATE INDEX idx_wallet_connections_address ON public.wallet_connections(wallet_address);

ALTER TABLE public.wallet_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_connections_select_own"
  ON public.wallet_connections FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "wallet_connections_insert_own"
  ON public.wallet_connections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wallet_connections_update_own"
  ON public.wallet_connections FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wallet_connections_delete_own"
  ON public.wallet_connections FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_wallet_connections_updated_at
  BEFORE UPDATE ON public.wallet_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- kyc_verifications table
CREATE TABLE public.kyc_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'persona',
  status TEXT NOT NULL DEFAULT 'pending',
  inquiry_id TEXT,
  reference_id TEXT,
  country TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT kyc_status_valid CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'expired'))
);

CREATE INDEX idx_kyc_verifications_user_id ON public.kyc_verifications(user_id);
CREATE INDEX idx_kyc_verifications_inquiry_id ON public.kyc_verifications(inquiry_id);

ALTER TABLE public.kyc_verifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own KYC status only
CREATE POLICY "kyc_verifications_select_own"
  ON public.kyc_verifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can create their own pending row (when starting an inquiry)
CREATE POLICY "kyc_verifications_insert_own"
  ON public.kyc_verifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No client-side updates — only the webhook (service role) can update status
-- (service role bypasses RLS by default)

CREATE TRIGGER update_kyc_verifications_updated_at
  BEFORE UPDATE ON public.kyc_verifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add KYC threshold to usdc_balances
ALTER TABLE public.usdc_balances
  ADD COLUMN kyc_required_threshold NUMERIC NOT NULL DEFAULT 100;