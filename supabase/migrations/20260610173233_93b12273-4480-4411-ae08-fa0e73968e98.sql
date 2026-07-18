
-- 1) Revoke EXECUTE from anon on all SECURITY DEFINER functions in public schema.
--    Keep EXECUTE for authenticated (needed for triggers, RLS helpers, and RPCs).
REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_items_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_price_alert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clean_old_recent_activities() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mask_email(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_profile() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_session() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_sentiment_aggregates() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_price_alert_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_tier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_portfolio_limit() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.ensure_default_portfolio() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_user_spreads_pro() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_limit() FROM PUBLIC, anon;

-- Re-grant EXECUTE to authenticated for functions invoked by triggers/RLS/RPC.
GRANT EXECUTE ON FUNCTION public.enforce_watchlist_items_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_price_alert() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clean_old_recent_activities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_email(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_sentiment_aggregates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_price_alert_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_portfolio_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_portfolio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_user_spreads_pro() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_watchlist_limit() TO authenticated;

-- service_role retains full access via ALL privileges by default-membership; ensure it.
GRANT EXECUTE ON FUNCTION public.cleanup_old_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- 2) audit_logs: explicit RESTRICTIVE deny for anon (defence-in-depth).
CREATE POLICY audit_logs_deny_anon
  ON public.audit_logs
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 3) price_comparisons: explicit RESTRICTIVE deny for anon.
CREATE POLICY price_comparisons_deny_anon
  ON public.price_comparisons
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- 4) api_rate_limits: block authenticated writes; only service_role manages records.
CREATE POLICY api_rate_limits_deny_authenticated_writes
  ON public.api_rate_limits
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY api_rate_limits_deny_authenticated_updates
  ON public.api_rate_limits
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY api_rate_limits_deny_authenticated_deletes
  ON public.api_rate_limits
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (false);
