-- In-app feedback. The app previously had no way at all for a user to tell the
-- owner something was wrong: no feedback link, no contact surface, nothing.
-- With activation as weak as it is (32 signups, ~5 ever returned, zero
-- portfolio positions ever created), the people bouncing had no channel to say
-- why.
--
-- Anonymous submissions are allowed on purpose: the most valuable feedback
-- comes from people who never finished signing up, and requiring an account to
-- complain would filter out exactly that group.
CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 4000),
  -- Optional reply address for anonymous submitters. Signed-in users are
  -- resolvable via user_id, so they don't need to retype it.
  contact_email TEXT CHECK (contact_email IS NULL OR char_length(contact_email) <= 320),
  -- Where they were when they hit the problem. The single most useful field
  -- for reproducing anything.
  route TEXT,
  user_agent TEXT,
  app_version TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX feedback_created_idx ON public.feedback(created_at DESC);
CREATE INDEX feedback_unresolved_idx ON public.feedback(created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- Anyone may submit, signed in or not. Nobody may read back through the API:
-- feedback can contain other people's contact details and complaints, so reads
-- are limited to admins via the policy below (and the service role, which
-- bypasses RLS entirely).
CREATE POLICY feedback_insert_anyone ON public.feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    -- A signed-in submitter may only attribute feedback to themselves; an
    -- anonymous one must leave user_id null rather than forging someone else's.
    user_id IS NULL OR user_id = auth.uid()
  );

CREATE POLICY feedback_admin_read ON public.feedback
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY feedback_admin_update ON public.feedback
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.feedback FROM anon, authenticated;
GRANT INSERT ON public.feedback TO anon, authenticated;
GRANT SELECT, UPDATE ON public.feedback TO authenticated;
