-- ============================================================
-- Live commodities news feed — Premium/Pro subscriber perk.
--
-- Real Reuters/LSEG access is enterprise-licensed, sales-quote-only, and
-- their standard individual terms explicitly forbid redistribution — not
-- viable at this app's scale (same shape of problem as the Elite tier's
-- Databento licensing, see elite_waitlist above it). NewsAPI.org's paid
-- Business plan ($449/mo) would be the legitimate paid path to broad
-- multi-outlet coverage, but that's a real fixed cost with no subscriber
-- data yet to justify it.
--
-- So this starts on sources that need no commercial license at all: EIA and
-- USDA NASS are official U.S. government data (no licensing question),
-- OilPrice.com/Mining.com/Hellenic Shipping News publish RSS specifically
-- for syndication — headline + snippet + link-back is exactly what RSS is
-- for. See supabase/functions/refresh-commodity-news-feed for the fetcher.
--
-- Cron-refreshed server-side (see docs/NEWS_FEED_REFRESH_SETUP.md) rather
-- than fetched per-client-request: bounds source load to one poller
-- regardless of subscriber count, and lets the paid-tier gate live in RLS
-- below instead of only being a client-side UI hide.
-- ============================================================

CREATE TABLE public.commodity_news_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dedupe key: "<source name>:<feed item guid-or-link>". Prefixed with the
  -- source so two unrelated feeds can never collide on a coincidentally
  -- identical guid.
  guid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  -- Matches the commodity-category taxonomy already used in
  -- fetch-commodity-news/enhanced-commodity-news (energy/metals/grains/
  -- livestock/softs/economic/geopolitical/general) rather than that other
  -- edge function pair's separate news-type taxonomy (market_analysis/
  -- regulatory/...) — this feed is about *which commodity* an article
  -- concerns, which is what a reader would actually want to filter by.
  category TEXT NOT NULL DEFAULT 'general',
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX commodity_news_feed_published_at_idx ON public.commodity_news_feed (published_at DESC);
CREATE INDEX commodity_news_feed_category_idx ON public.commodity_news_feed (category);

ALTER TABLE public.commodity_news_feed ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commodity_news_feed FROM anon;

-- Read-only, and only for subscribers on a paid tier — this is the actual
-- product gate, not just a client-side hide. No insert/update/delete policy
-- for authenticated/anon at all: every write comes from the cron-invoked
-- edge function via the service role, which bypasses RLS entirely.
CREATE POLICY commodity_news_feed_select_paid_tier ON public.commodity_news_feed
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.subscription_active = true
        AND profiles.subscription_tier IN ('premium', 'pro')
    )
  );
