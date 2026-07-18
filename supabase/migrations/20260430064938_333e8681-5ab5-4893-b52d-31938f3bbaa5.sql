-- Restrict system_metrics: remove broad authenticated SELECT, replace with no public access.
-- Only service_role (edge functions) can read this table.
DROP POLICY IF EXISTS "System metrics are viewable by authenticated users" ON public.system_metrics;

-- No SELECT policy = denied by default for anon/authenticated under RLS.
-- service_role bypasses RLS, so edge functions and admin tooling continue to work.

-- Defensive: revoke any direct table grants from anon/authenticated.
REVOKE ALL ON public.system_metrics FROM anon, authenticated;