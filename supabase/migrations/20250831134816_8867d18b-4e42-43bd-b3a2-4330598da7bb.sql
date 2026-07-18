-- Create trading orders table for order history and status
CREATE TABLE public.trading_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  ibkr_order_id INTEGER,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  quantity NUMERIC NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('MKT', 'LMT', 'STP', 'STP_LMT', 'TRAIL')),
  price NUMERIC,
  stop_price NUMERIC,
  trail_amount NUMERIC,
  tif TEXT NOT NULL DEFAULT 'DAY' CHECK (tif IN ('GTC', 'DAY', 'IOC', 'FOK')),
  status TEXT NOT NULL DEFAULT 'PendingSubmit' CHECK (status IN ('PendingSubmit', 'Submitted', 'Filled', 'Cancelled', 'Rejected')),
  filled_quantity NUMERIC DEFAULT 0,
  avg_fill_price NUMERIC,
  commission NUMERIC,
  order_ref TEXT,
  parent_order_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  filled_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT
);

-- Create trade executions table for completed trades
CREATE TABLE public.trade_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES public.trading_orders(id),
  execution_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  commission NUMERIC NOT NULL DEFAULT 0,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create portfolio snapshots table for historical portfolio states
CREATE TABLE public.portfolio_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL,
  net_liquidation NUMERIC NOT NULL,
  total_cash_value NUMERIC NOT NULL,
  buying_power NUMERIC NOT NULL,
  positions JSONB NOT NULL DEFAULT '[]'::jsonb,
  unrealized_pnl NUMERIC NOT NULL DEFAULT 0,
  realized_pnl NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create risk metrics table for portfolio risk calculations
CREATE TABLE public.risk_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  portfolio_value NUMERIC NOT NULL,
  var_1day NUMERIC,
  var_5day NUMERIC,
  max_drawdown NUMERIC,
  sharpe_ratio NUMERIC,
  beta NUMERIC,
  position_concentration JSONB,
  sector_allocation JSONB,
  risk_score INTEGER CHECK (risk_score BETWEEN 1 AND 10),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trading sessions table for connection logs
CREATE TABLE public.trading_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL,
  gateway TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ended_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'expired', 'error')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create audit logs table for compliance tracking
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.trading_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for trading_orders
CREATE POLICY "Users can manage their own trading orders" 
ON public.trading_orders 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for trade_executions
CREATE POLICY "Users can view their own trade executions" 
ON public.trade_executions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert trade executions" 
ON public.trade_executions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create RLS policies for portfolio_snapshots
CREATE POLICY "Users can view their own portfolio snapshots" 
ON public.portfolio_snapshots 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can manage portfolio snapshots" 
ON public.portfolio_snapshots 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for risk_metrics
CREATE POLICY "Users can view their own risk metrics" 
ON public.risk_metrics 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can manage risk metrics" 
ON public.risk_metrics 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for trading_sessions
CREATE POLICY "Users can view their own trading sessions" 
ON public.trading_sessions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can manage trading sessions" 
ON public.trading_sessions 
FOR ALL 
USING (auth.uid() = user_id);

-- Create RLS policies for audit_logs
CREATE POLICY "Users can view their own audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "System can insert audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_trading_orders_user_id ON public.trading_orders(user_id);
CREATE INDEX idx_trading_orders_status ON public.trading_orders(status);
CREATE INDEX idx_trading_orders_created_at ON public.trading_orders(created_at);

CREATE INDEX idx_trade_executions_user_id ON public.trade_executions(user_id);
CREATE INDEX idx_trade_executions_order_id ON public.trade_executions(order_id);
CREATE INDEX idx_trade_executions_executed_at ON public.trade_executions(executed_at);

CREATE INDEX idx_portfolio_snapshots_user_id ON public.portfolio_snapshots(user_id);
CREATE INDEX idx_portfolio_snapshots_date ON public.portfolio_snapshots(snapshot_date);

CREATE INDEX idx_risk_metrics_user_id ON public.risk_metrics(user_id);
CREATE INDEX idx_risk_metrics_date ON public.risk_metrics(metric_date);

CREATE INDEX idx_trading_sessions_user_id ON public.trading_sessions(user_id);
CREATE INDEX idx_trading_sessions_session_id ON public.trading_sessions(session_id);

CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Create function to update updated_at column
CREATE OR REPLACE FUNCTION public.update_trading_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_trading_orders_updated_at
BEFORE UPDATE ON public.trading_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_trading_updated_at_column();

-- Create function to log trading activities for audit
CREATE OR REPLACE FUNCTION public.log_trading_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_logs (
    user_id,
    action_type,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    COALESCE(NEW.user_id, OLD.user_id),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::TEXT, OLD.id::TEXT),
    CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers for trading orders
CREATE TRIGGER audit_trading_orders
AFTER INSERT OR UPDATE OR DELETE ON public.trading_orders
FOR EACH ROW
EXECUTE FUNCTION public.log_trading_activity();