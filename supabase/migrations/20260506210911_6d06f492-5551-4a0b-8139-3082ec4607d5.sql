-- =============================================
-- subscribers: belt-and-suspenders SELECT lock
-- =============================================
-- A RESTRICTIVE policy is ANDed with every permissive SELECT policy, so even if
-- someone later adds a permissive `USING (true)` by mistake, this still pins
-- reads to the owning user.
CREATE POLICY "subscribers_restrictive_owner_only_select"
ON public.subscribers
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (user_id = auth.uid() AND auth.uid() IS NOT NULL);

-- =============================================
-- profiles: explicit anon deny + restrictive owner-only
-- =============================================
CREATE POLICY "profiles_deny_anon"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "profiles_restrictive_owner_only_select"
ON public.profiles
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (id = auth.uid() AND auth.uid() IS NOT NULL);

-- =============================================
-- api_rate_limits: block anon entirely, scope writes to owner
-- =============================================
CREATE POLICY "api_rate_limits_deny_anon"
ON public.api_rate_limits
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

CREATE POLICY "api_rate_limits_insert_own"
ON public.api_rate_limits
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "api_rate_limits_update_own"
ON public.api_rate_limits
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "api_rate_limits_delete_own"
ON public.api_rate_limits
FOR DELETE
TO authenticated
USING (user_id = auth.uid());