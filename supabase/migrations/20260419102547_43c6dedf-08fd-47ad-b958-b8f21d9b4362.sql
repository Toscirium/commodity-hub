-- Track per-user acceptance of Terms and Risk Disclosure versions
CREATE TABLE public.user_legal_acceptance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  terms_version TEXT NOT NULL,
  risk_disclosure_version TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_legal_acceptance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_legal_acceptance_select_own"
ON public.user_legal_acceptance
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "user_legal_acceptance_insert_own"
ON public.user_legal_acceptance
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_legal_acceptance_update_own"
ON public.user_legal_acceptance
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_user_legal_acceptance_updated_at
BEFORE UPDATE ON public.user_legal_acceptance
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();