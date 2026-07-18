
-- 1. Fix subscribers: remove overly permissive system policies and restrict to service_role only
DROP POLICY IF EXISTS "subscribers_insert_system" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_update_system" ON public.subscribers;

-- 2. Fix system_metrics: restrict insert to service_role (remove permissive true)
DROP POLICY IF EXISTS "System can insert metrics" ON public.system_metrics;

-- 3. Fix api_rate_limits: remove overly permissive ALL policy
DROP POLICY IF EXISTS "System can manage rate limits" ON public.api_rate_limits;

-- 4. Fix cleanup_old_metrics function: add SET search_path
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.system_metrics 
  WHERE created_at < now() - interval '7 days';
  
  DELETE FROM public.api_rate_limits 
  WHERE window_start < now() - interval '1 day';
END;
$$;
