// Live commodities news feed for Premium/Pro subscribers — cron-refreshed
// into commodity_news_feed from public RSS sources that need no commercial
// license (see that migration's header comment for why: Reuters/LSEG is
// enterprise-only and explicitly forbids redistribution; a real NewsAPI.org
// Business plan would be $449/mo with no subscriber data yet to justify
// it). Parsing/categorization logic lives in rss.ts so it can be unit
// tested without pulling in this file's serve() call — see rss_test.ts.
//
// Invoked by pg_cron via net.http_post (no JWT — service-role auth header
// internally), same pattern as evaluate-price-alerts. See
// docs/NEWS_FEED_REFRESH_SETUP.md for the cron.schedule SQL to run once.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { dedupeByGuid, FEED_SOURCES, parseFeed, type FeedSource, type NewsRow } from './rss.ts';

const FETCH_TIMEOUT_MS = 10_000;
const RETENTION_DAYS = 14;

async function fetchSource(
  source: FeedSource,
  logger: EdgeLogger,
): Promise<{ rows: NewsRow[]; error?: string }> {
  try {
    const res = await fetch(source.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'CommodityHubNewsBot/1.0 (+https://commodity-hub.eu)' },
    });
    if (!res.ok) return { rows: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    const rows = parseFeed(xml, source, (reason, detail) =>
      logger.debug(`${source.name}: skipped item (${reason})`, detail),
    );
    return { rows };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : String(err) };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const logger = new EdgeLogger({ functionName: 'refresh-commodity-news-feed' });

  // Same gate as evaluate-price-alerts: no end user ever calls this
  // directly — the client reads commodity_news_feed straight from
  // Supabase, RLS-gated to paid tiers. The only legitimate caller is
  // pg_cron via net.http_post with the service-role key as Bearer.
  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

  const results = await Promise.all(FEED_SOURCES.map((source) => fetchSource(source, logger)));

  const summary: Record<string, { fetched: number; error?: string }> = {};
  const allRows: NewsRow[] = [];
  results.forEach((result, i) => {
    const source = FEED_SOURCES[i];
    summary[source.name] = result.error
      ? { fetched: result.rows.length, error: result.error }
      : { fetched: result.rows.length };
    if (result.error) logger.warn(`source failed: ${source.name}`, { error: result.error });
    allRows.push(...result.rows);
  });

  // Must dedupe before the upsert, not after — see dedupeByGuid: one
  // repeated guid anywhere in the batch aborts the whole statement.
  const rows = dedupeByGuid(allRows);
  const duplicatesDropped = allRows.length - rows.length;

  let upserted = 0;
  if (rows.length) {
    const { error } = await supabase.from('commodity_news_feed').upsert(rows, { onConflict: 'guid' });
    if (error) {
      logger.error('upsert failed', error);
    } else {
      upserted = rows.length;
    }
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: cleanupError } = await supabase
    .from('commodity_news_feed')
    .delete()
    .lt('published_at', cutoff);
  if (cleanupError) logger.warn('cleanup failed', cleanupError);

  logger.info('refresh complete', { upserted, duplicatesDropped, sources: summary });

  return new Response(JSON.stringify({ ok: true, upserted, duplicatesDropped, sources: summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
