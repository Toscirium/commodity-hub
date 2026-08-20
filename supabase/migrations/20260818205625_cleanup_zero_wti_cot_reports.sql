-- Recovered from remote migration history (applied 2026-08-18 20:56 UTC,
-- outside git) and committed here now so `supabase migration list` stops
-- reporting drift. Content is byte-for-byte what's already live — verified
-- via the Management API's database/query endpoint against
-- supabase_migrations.schema_migrations. One-time data cleanup, not a
-- schema change; re-running it is a safe no-op once the bad rows are gone.
--
-- Deleted WTI Crude Oil COT report rows where both managed_money_long and
-- managed_money_short were 0 — almost certainly bad/incomplete ingested
-- data rather than a real zero-positioning report.
DELETE FROM public.cot_reports
WHERE commodity = 'WTI Crude Oil'
  AND managed_money_long = 0
  AND managed_money_short = 0;
