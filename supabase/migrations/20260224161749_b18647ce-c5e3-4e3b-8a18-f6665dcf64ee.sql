-- Fix 1: Drop audit_logs INSERT policy to prevent users from forging audit entries
-- The log_trading_activity() SECURITY DEFINER trigger will continue to work
DROP POLICY IF EXISTS "audit_logs_system_insert" ON public.audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Fix 2: Drop any remaining permissive subscriber policies
DROP POLICY IF EXISTS "Edge functions can update subscriptions" ON public.subscribers;
DROP POLICY IF EXISTS "Edge functions can insert subscriptions" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_insert_system" ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_update_system" ON public.subscribers;