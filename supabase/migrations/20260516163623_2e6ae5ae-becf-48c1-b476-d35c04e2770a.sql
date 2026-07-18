-- 1. profiles: block client writes to subscription/billing columns via RESTRICTIVE policy
DROP POLICY IF EXISTS profiles_block_subscription_field_writes ON public.profiles;
CREATE POLICY profiles_block_subscription_field_writes
ON public.profiles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (
  subscription_tier        IS NOT DISTINCT FROM (SELECT p.subscription_tier        FROM public.profiles p WHERE p.id = profiles.id)
  AND subscription_active  IS NOT DISTINCT FROM (SELECT p.subscription_active     FROM public.profiles p WHERE p.id = profiles.id)
  AND subscription_end     IS NOT DISTINCT FROM (SELECT p.subscription_end        FROM public.profiles p WHERE p.id = profiles.id)
  AND billing_state        IS NOT DISTINCT FROM (SELECT p.billing_state           FROM public.profiles p WHERE p.id = profiles.id)
  AND grace_period_expires_at IS NOT DISTINCT FROM (SELECT p.grace_period_expires_at FROM public.profiles p WHERE p.id = profiles.id)
);

-- 2. api_rate_limits: remove all client writes; only service role can mutate
DROP POLICY IF EXISTS api_rate_limits_insert_own ON public.api_rate_limits;
DROP POLICY IF EXISTS api_rate_limits_update_own ON public.api_rate_limits;
DROP POLICY IF EXISTS api_rate_limits_delete_own ON public.api_rate_limits;

-- 3. subscribers: remove client DELETE
DROP POLICY IF EXISTS subscribers_delete_own ON public.subscribers;