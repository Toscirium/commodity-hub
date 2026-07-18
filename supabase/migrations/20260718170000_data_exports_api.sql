-- Pro data exports, API credentials, and report schedules. Raw API keys are
-- never stored; only a SHA-256 digest is persisted.
CREATE TABLE public.data_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX data_api_keys_active_user_idx ON public.data_api_keys(user_id) WHERE revoked_at IS NULL;
ALTER TABLE public.data_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_api_keys FROM anon, authenticated;

CREATE TABLE public.export_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  dataset TEXT NOT NULL CHECK (dataset IN ('portfolio', 'watchlists')),
  format TEXT NOT NULL CHECK (format IN ('csv', 'xlsx')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.export_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY export_schedules_own ON public.export_schedules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
