-- Recovered from remote migration history (applied 2026-08-18 20:32 UTC,
-- outside git during the same session that was diagnosing the native
-- sign-in hang) and committed here now so `supabase migration list` stops
-- reporting drift and this fix is actually tracked in the repo. Content is
-- byte-for-byte what's already live — verified via the Management API's
-- database/query endpoint against supabase_migrations.schema_migrations.
--
-- Fixes real infinite-recursion risk in the "Members can view conversation
-- membership" policy added by 20260725120000_messaging.sql: that policy's
-- USING clause queried conversation_members from within a policy ON
-- conversation_members ("mine" self-join), which Postgres RLS can evaluate
-- recursively. A SECURITY DEFINER helper function breaks the recursion by
-- running the membership check outside the calling policy's RLS context.

CREATE OR REPLACE FUNCTION public.is_conversation_member(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = _conversation_id
      AND cm.user_id = _user_id
  )
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can view conversation membership" ON public.conversation_members;

CREATE POLICY "Members can view conversation membership"
ON public.conversation_members
FOR SELECT
TO authenticated
USING (public.is_conversation_member(conversation_id, auth.uid()));

REVOKE ALL ON FUNCTION public.touch_conversation_from_message() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_conversation_from_message() TO service_role;
