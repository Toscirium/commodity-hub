-- Revoke EXECUTE on internal SECURITY DEFINER functions from public/anon/authenticated
-- These functions are called only by triggers or server-side code, never directly by clients.

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clean_old_recent_activities() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_sentiment_aggregates() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_metrics() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mask_email(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_business_hours() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_session() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_user_profile() FROM PUBLIC, anon, authenticated;