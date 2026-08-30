-- Fix a fail-open hole in the Pro-tier enforcement triggers.
--
-- Found by functionally testing the basis_entries gate right after deploying
-- it (inserting as a user with no profiles row) rather than trusting that the
-- trigger worked: the insert SUCCEEDED when it should have been rejected.
--
-- Cause: public.get_user_tier() is
--     SELECT CASE ... ELSE 'free' END FROM public.profiles WHERE id = _user_id
-- so for a user with NO profiles row it returns NULL — the ELSE 'free' only
-- applies to a row that exists, and no row means no result at all. The
-- triggers then did:
--     IF tier <> 'pro' THEN RAISE EXCEPTION ...
-- and in SQL's three-valued logic `NULL <> 'pro'` is NULL, not TRUE, so the
-- IF never fired and the write went through unchecked. A paywall failing open.
--
-- This is NOT specific to basis_entries — enforce_user_spreads_pro has had
-- the identical bug since it shipped, and is fixed here too. Both now use
-- `IS DISTINCT FROM`, which is null-safe: NULL IS DISTINCT FROM 'pro' is TRUE,
-- so a user with no profile row is correctly treated as not-Pro and blocked.
--
-- Exposure was narrow (requires an authenticated user with no profiles row,
-- and RLS still restricts writes to their own user_id), but a tier gate that
-- silently passes is worth closing regardless of how hard it is to reach.

CREATE OR REPLACE FUNCTION public.enforce_basis_entries_pro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF tier IS DISTINCT FROM 'pro' THEN
    RAISE EXCEPTION 'Basis tracking requires Pro tier' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_user_spreads_pro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tier TEXT;
BEGIN
  tier := public.get_user_tier(NEW.user_id);
  IF tier IS DISTINCT FROM 'pro' THEN
    RAISE EXCEPTION 'Custom spreads require Pro tier' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
