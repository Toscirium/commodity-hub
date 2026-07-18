-- 1. system_metrics: explicit deny-all for client roles.
-- Writes/reads happen exclusively via edge functions using the service role,
-- which bypasses RLS. Adding explicit policies documents intent and silences
-- the linter "RLS enabled, no policy" warning.
CREATE POLICY "system_metrics_deny_authenticated"
ON public.system_metrics
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "system_metrics_deny_anon"
ON public.system_metrics
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 2. user_favorites: add missing UPDATE policy so users can edit their own
-- favorites (e.g. rename, regroup) without needing delete+insert.
CREATE POLICY "user_favorites_strict_update"
ON public.user_favorites
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());