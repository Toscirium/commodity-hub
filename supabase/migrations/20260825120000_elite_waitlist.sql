-- ============================================================
-- Elite tier demand validation.
--
-- Real-time CME data (via Databento, GLBX.MDP3) for Commodity Hub's own
-- paying subscribers requires their Plus plan — $1,750/mo on a signed
-- annual contract, not the $199/mo Standard plan (Standard is licensed for
-- personal/non-commercial use only, confirmed directly against Databento's
-- feature-comparison table). That's a real $21k/yr commitment with no
-- revenue behind it yet, so before signing anything: gauge actual interest.
--
-- One row per user (the PK), so "joined" is a simple existence check and a
-- second click is a harmless no-op rather than a duplicate signup.
-- ============================================================

CREATE TABLE public.elite_waitlist (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Where they joined from, e.g. 'options_chain' — lets us see which pitch
  -- actually drives interest if this ends up on more than one page.
  source TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.elite_waitlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elite_waitlist FROM anon;

-- A user can join (insert their own row) and check whether they've already
-- joined (select their own row). No update/delete policy: leaving the
-- waitlist isn't self-serve yet — low stakes, and keeps this table simple
-- while it's purely a signal-gathering exercise. Counting/exporting
-- interest is a service-role operation (RLS doesn't apply), not a client
-- capability.
CREATE POLICY elite_waitlist_insert_own ON public.elite_waitlist
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY elite_waitlist_select_own ON public.elite_waitlist
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
