-- Team Workspace (the "teams"/"team_members"/"team_comments" trio from
-- 20260718190000_b2b_workspaces.sql) is now served entirely through the
-- team-workspace edge function using the service role, which bypasses RLS.
-- The existing RLS policies only ever covered SELECT + an owner-side ALL on
-- `teams` — no INSERT policy on team_members/team_comments at all, so
-- teammates could never actually be added or comment without going through
-- server-side logic anyway. Lock down direct client access explicitly
-- (same pattern as data_api_keys) so a client can't INSERT into `teams`
-- directly and bypass the Pro-tier + one-team-per-owner checks that live in
-- the edge function.
REVOKE ALL ON public.teams FROM anon, authenticated;
REVOKE ALL ON public.team_members FROM anon, authenticated;
REVOKE ALL ON public.team_comments FROM anon, authenticated;
