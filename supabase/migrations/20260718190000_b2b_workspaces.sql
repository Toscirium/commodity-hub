-- B2B collaboration foundation: saved dashboards, controlled sharing, teams,
-- comments/approvals, and report-delivery destinations.
CREATE TABLE public.dashboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100), layout JSONB NOT NULL DEFAULT '[]',
  share_token UUID UNIQUE DEFAULT gen_random_uuid(), is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY dashboards_owner ON public.dashboards FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.teams (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE public.team_members (team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE, user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(team_id,user_id));
CREATE TABLE public.team_comments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE, user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, entity_type TEXT NOT NULL, entity_id UUID, body TEXT NOT NULL, approval_state TEXT CHECK(approval_state IN ('pending','approved','rejected')), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY; ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY; ALTER TABLE public.team_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY teams_owner ON public.teams FOR ALL TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
CREATE POLICY team_members_self ON public.team_members FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY team_comments_member ON public.team_comments FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.team_members m WHERE m.team_id=team_comments.team_id AND m.user_id=auth.uid()));

ALTER TABLE public.export_schedules ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'download' CHECK(delivery_type IN ('download','webhook','email'));
ALTER TABLE public.export_schedules ADD COLUMN IF NOT EXISTS delivery_target TEXT;
