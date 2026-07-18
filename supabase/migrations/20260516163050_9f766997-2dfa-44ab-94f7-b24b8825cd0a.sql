ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_state text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS grace_period_expires_at timestamp with time zone NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_billing_state_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_billing_state_check
  CHECK (billing_state IN ('active','grace','on_hold','canceled','none'));