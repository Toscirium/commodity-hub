
REVOKE EXECUTE ON FUNCTION public.enforce_user_spreads_pro() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_watchlist_items_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_price_alert() FROM PUBLIC, anon, authenticated;
