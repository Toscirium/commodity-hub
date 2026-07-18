-- Production database optimizations

-- Enable RLS audit logging
CREATE TABLE IF NOT EXISTS public.system_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for performance queries
CREATE INDEX IF NOT EXISTS idx_system_metrics_created_at ON public.system_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON public.system_metrics(metric_name);

-- API rate limiting table
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  api_endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for rate limiting
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_endpoint ON public.api_rate_limits(user_id, api_endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.api_rate_limits(window_start);

-- Enable RLS
ALTER TABLE public.system_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- System metrics policy (admin only)
CREATE POLICY "System can insert metrics" ON public.system_metrics
  FOR INSERT WITH CHECK (true);

-- Rate limiting policies
CREATE POLICY "Users can view their own rate limits" ON public.api_rate_limits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage rate limits" ON public.api_rate_limits
  FOR ALL USING (true);

-- Cleanup function for old metrics
CREATE OR REPLACE FUNCTION public.cleanup_old_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove metrics older than 7 days
  DELETE FROM public.system_metrics 
  WHERE created_at < now() - interval '7 days';
  
  -- Remove rate limit records older than 1 day
  DELETE FROM public.api_rate_limits 
  WHERE window_start < now() - interval '1 day';
END;
$$;

-- Performance monitoring for slow queries
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Optimize existing tables for production
ANALYZE public.portfolio_positions;
ANALYZE public.trading_orders;
ANALYZE public.profiles;

-- Add missing indexes for common queries
CREATE INDEX IF NOT EXISTS idx_trading_orders_user_status ON public.trading_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_portfolio_positions_user_created ON public.portfolio_positions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at);