// Per-commodity news for the panel inside each expanded CommodityCard.
//
// Reads the RSS-sourced commodity_news_feed table (populated every 30 min by
// refresh-commodity-news-feed) instead of calling a paid news API per
// request. Rewritten 2026-08-26; it previously called Marketaux and then
// NewsAPI.org, which had three problems:
//
//  1. NewsAPI's free plan is licensed for "development and testing in a
//     development environment only" — this was production use.
//  2. Both free tiers cap at ~100 requests/day shared across ALL users, so
//     the feature degraded exactly when traffic rose. One promotional post
//     would exhaust the day's quota before lunch.
//  3. When they returned nothing it fabricated articles bylined to Reuters,
//     Bloomberg and the WSJ (removed in 6673aef).
//
// The RSS feeds behind commodity_news_feed are published for syndication, so
// there is no licensing question, no per-request quota, and one poller now
// serves any number of users.
//
// Reads with the service role deliberately: commodity_news_feed is RLS-gated
// to paid subscribers for the /market-news page, but this per-commodity
// panel is a pre-existing free-tier (and guest) feature. Routing it through
// this function keeps that database gate intact rather than opening the
// table up, and caps what non-subscribers can pull to ARTICLE_LIMIT of the
// headlines matching one commodity.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'
import { selectForCommodity } from '../_shared/commodity-news-match.ts'

// No upstream quota to protect any more — this only guards the database
// against a single abusive client.
const limiter = new IpRateLimiter({ limit: 60, windowMs: 60_000 });

const ARTICLE_LIMIT = 8;

interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  urlToImage?: string;
  category?: string;
}

interface FeedRow {
  id: string;
  title: string;
  description: string;
  url: string;
  source_name: string;
  category: string;
  published_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = IpRateLimiter.getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Same input validation as before.
    const commodity = typeof body.commodity === 'string' && body.commodity.length > 0 && body.commodity.length <= 100
      ? body.commodity.replace(/[^a-zA-Z0-9\s-]/g, '')
      : null;

    if (!commodity) {
      return new Response(
        JSON.stringify({ error: 'Commodity parameter is required and must be a valid string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pull the recent window and rank in memory. The table is pruned to 14
    // days and runs a couple hundred rows, so this is one small query rather
    // than a per-commodity SQL text search — and it keeps the ranking rules
    // in one tested module shared with the tests.
    const { data, error } = await supabase
      .from('commodity_news_feed')
      .select('id, title, description, url, source_name, category, published_at')
      .order('published_at', { ascending: false })
      .limit(400);

    if (error) throw error;

    const matched = selectForCommodity((data ?? []) as FeedRow[], commodity, ARTICLE_LIMIT);

    const articles: NewsItem[] = matched.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      url: row.url,
      source: row.source_name,
      publishedAt: row.published_at,
      category: row.category,
    }));

    return new Response(
      JSON.stringify({ articles, source: 'rss' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enhanced commodity news:', error);

    // No fabricated fallback — clients render their own "No Recent News"
    // state. See the note in src/services/newsHelpers.ts.
    return new Response(
      JSON.stringify({ articles: [], source: 'error', error: 'Failed to fetch news' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
