-- 1. Lock down user_roles writes: only service_role may modify role assignments.
--    Authenticated users can SELECT (existing policy) but never INSERT/UPDATE/DELETE.
CREATE POLICY "user_roles_deny_authenticated_insert"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "user_roles_deny_authenticated_update"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "user_roles_deny_authenticated_delete"
ON public.user_roles
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (false);

-- 2. Remove the user-facing UPDATE policy on subscribers; subscription state is
--    written exclusively by service-role edge functions (RevenueCat / Stripe).
DROP POLICY IF EXISTS "subscribers_update_own" ON public.subscribers;

-- Add a restrictive deny so future permissive policies cannot accidentally
-- re-enable user-driven updates of subscription_tier / stripe_customer_id.
CREATE POLICY "subscribers_deny_authenticated_update"
ON public.subscribers
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);