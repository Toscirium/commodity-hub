-- Secure system_metrics table
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "System metrics are viewable by everyone" ON public.system_metrics;
CREATE POLICY "System metrics are viewable by authenticated users"
ON public.system_metrics
FOR SELECT
TO authenticated
USING (true);

-- Secure api_rate_limits table (Allowing users to see their own limits)
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their own rate limits" ON public.api_rate_limits;
CREATE POLICY "Users can view their own rate limits"
ON public.api_rate_limits
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Note: No INSERT/UPDATE policies are needed as these tables should be managed by system/service_role
