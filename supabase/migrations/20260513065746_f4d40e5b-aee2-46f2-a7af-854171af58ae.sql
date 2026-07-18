-- App role enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer role check (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Policies
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;
CREATE POLICY "user_roles_select_own"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_roles_admin_select_all" ON public.user_roles;
CREATE POLICY "user_roles_admin_select_all"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "user_roles_deny_anon" ON public.user_roles;
CREATE POLICY "user_roles_deny_anon"
  ON public.user_roles AS RESTRICTIVE FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Allow admins to read system_metrics (currently fully denied) so the audit dashboard works
DROP POLICY IF EXISTS "system_metrics_admin_select" ON public.system_metrics;
CREATE POLICY "system_metrics_admin_select"
  ON public.system_metrics FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));