-- Drop trading-related tables (cascade to cover any FK/trigger references)
DROP TABLE IF EXISTS public.synthetic_trade_history CASCADE;
DROP TABLE IF EXISTS public.synthetic_positions CASCADE;
DROP TABLE IF EXISTS public.usdc_balances CASCADE;
DROP TABLE IF EXISTS public.blofin_credentials CASCADE;
DROP TABLE IF EXISTS public.ibkr_credentials CASCADE;
DROP TABLE IF EXISTS public.trade_executions CASCADE;
DROP TABLE IF EXISTS public.trading_orders CASCADE;
DROP TABLE IF EXISTS public.trading_sessions CASCADE;
DROP TABLE IF EXISTS public.portfolio_snapshots CASCADE;
DROP TABLE IF EXISTS public.risk_metrics CASCADE;
DROP TABLE IF EXISTS public.kyc_verifications CASCADE;
DROP TABLE IF EXISTS public.user_legal_acceptance CASCADE;
DROP TABLE IF EXISTS public.wallet_connections CASCADE;
DROP TABLE IF EXISTS public.forum_posts CASCADE;
DROP TABLE IF EXISTS public.forum_topics CASCADE;
DROP TABLE IF EXISTS public.forums CASCADE;

-- Drop now-orphaned audit/trading helper functions
DROP FUNCTION IF EXISTS public.log_credential_access() CASCADE;
DROP FUNCTION IF EXISTS public.log_trading_activity() CASCADE;
DROP FUNCTION IF EXISTS public.verify_credential_owner(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.update_trading_updated_at_column() CASCADE;