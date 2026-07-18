-- Add RLS policy to system_metrics to prevent public access
-- Only service role (edge functions) should write; no public read needed
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for regular users
-- Service role bypasses RLS, so edge functions can still write