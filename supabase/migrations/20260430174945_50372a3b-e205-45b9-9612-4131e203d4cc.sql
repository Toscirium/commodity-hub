-- Harden subscribers table against anon access and NULL user_id rows

-- 1. Remove orphan rows that cannot be safely owned
DELETE FROM public.subscribers WHERE user_id IS NULL;

-- 2. Enforce NOT NULL on user_id
ALTER TABLE public.subscribers ALTER COLUMN user_id SET NOT NULL;

-- 3. Lock down table grants: revoke from anon/public, grant only to authenticated
REVOKE ALL ON public.subscribers FROM anon;
REVOKE ALL ON public.subscribers FROM public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO authenticated;

-- 4. Defense-in-depth: restrictive policy that denies anon for all operations
DROP POLICY IF EXISTS subscribers_deny_anon ON public.subscribers;
CREATE POLICY subscribers_deny_anon
ON public.subscribers
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- 5. Tighten SELECT policy with explicit non-null auth.uid() check
DROP POLICY IF EXISTS subscribers_select_own ON public.subscribers;
CREATE POLICY subscribers_select_own
ON public.subscribers
FOR SELECT
TO authenticated
USING ((user_id = auth.uid()) AND (auth.uid() IS NOT NULL));