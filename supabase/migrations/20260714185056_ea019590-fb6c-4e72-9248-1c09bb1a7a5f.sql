-- Pro Daily Brief inbox: one row per user per day
CREATE TABLE public.pro_daily_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brief_date DATE NOT NULL,
  headline TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, brief_date)
);

GRANT SELECT, UPDATE ON public.pro_daily_briefs TO authenticated;
GRANT ALL ON public.pro_daily_briefs TO service_role;

ALTER TABLE public.pro_daily_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own briefs"
  ON public.pro_daily_briefs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users mark own briefs read"
  ON public.pro_daily_briefs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX pro_daily_briefs_user_date_idx
  ON public.pro_daily_briefs (user_id, brief_date DESC);
