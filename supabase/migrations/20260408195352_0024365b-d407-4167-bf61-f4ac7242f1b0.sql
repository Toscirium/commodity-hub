-- Create blofin_credentials table for encrypted BloFin API keys
CREATE TABLE public.blofin_credentials (
    id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL,
    api_key_encrypted text NOT NULL,
    secret_key_encrypted text NOT NULL,
    passphrase_encrypted text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    environment text NOT NULL DEFAULT 'live',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT blofin_environment_check CHECK (environment IN ('live', 'demo'))
);

-- Enable RLS
ALTER TABLE public.blofin_credentials ENABLE ROW LEVEL SECURITY;

-- RLS policies - only owner can access
CREATE POLICY "blofin_credentials_select_own"
ON public.blofin_credentials FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "blofin_credentials_insert_own"
ON public.blofin_credentials FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "blofin_credentials_update_own"
ON public.blofin_credentials FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "blofin_credentials_delete_own"
ON public.blofin_credentials FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_blofin_credentials_updated_at
BEFORE UPDATE ON public.blofin_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Audit logging trigger
CREATE TRIGGER log_blofin_credential_access
AFTER INSERT OR UPDATE OR DELETE ON public.blofin_credentials
FOR EACH ROW
EXECUTE FUNCTION public.log_credential_access();