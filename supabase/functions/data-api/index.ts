import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';
import { rateLimitHeaders, tooManyRequestsResponse, type RateLimitResult } from '../_shared/rateLimit.ts';
import { CommodityService } from '../_shared/commodity-service.ts';

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((v) => v.toString(16).padStart(2, '0')).join('');
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' } });

// Per-key limit, not per-IP: a quant shop hitting this from one server IP
// should still get the full budget. 60 req/min is generous for polling a
// data feed while keeping a leaked/shared key from hammering the DB.
//
// DB-backed (an atomic UPSERT-increment via data_api_increment_rate), not
// the in-memory IpRateLimiter this used to use — that was found not to
// hold up under concurrent requests (see messages/index.ts's history for
// the same bug caught by end-to-end testing): Supabase's edge runtime
// spins up separate isolates per concurrent request, so a per-isolate
// in-memory counter barely limits anything under a real burst.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
// Raised 2026-08-27 from 260 (5yr) — a ceiling on what a request can ask
// for, not a claim about how much history actually exists. cot_reports is
// currently populated back to 2019 (~340 weeks); this just stops the cap
// itself from being the limiting factor if/when older data gets backfilled.
const MAX_COT_LIMIT = 520; // 10 years of weekly reports
// Requests/day for a key whose owner isn't on an active Pro subscription —
// lets a prospect evaluate the API for real before paying anything, instead
// of requiring a full Pro subscription just to see a response. Pro keys are
// exempt (RATE_LIMIT/RATE_WINDOW_MS above is their only cap). Chosen to
// land in the same range competitors' free tiers use (OilPriceAPI: 50/day,
// CommodityFundamentals: 1,000/day) without being generous enough to
// substitute for actually subscribing.
const TRIAL_DAILY_LIMIT = 50;
const TIMEFRAMES = new Set(['1d', '1m', '3m', '6m', '1y', '2y']); // matches api-docs' ChartDataPoint enum

// Supabase Edge Functions (Deno Deploy) keep an isolate alive for
// EdgeRuntime.waitUntil()'d work after the response has already been sent.
// Falls back to firing the task without awaiting it if that global isn't
// present (e.g. local `supabase functions serve`) — never blocks the
// response either way. Same helper as messages/index.ts.
const runBackground = (task: Promise<unknown>) => {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task);
  else task.catch(() => {});
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!raw.startsWith('ch_live_')) return json({ error: 'api_key_required' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: key } = await admin.from('data_api_keys').select('id,user_id').eq('key_hash', await hash(raw)).is('revoked_at', null).maybeSingle();
  if (!key) return json({ error: 'invalid_api_key' }, 401);
  // Any authenticated user can create a key now (see export-center) — Pro
  // gets the uncapped 60/min-only path below, everyone else gets a daily
  // trial allowance instead of an outright 403. Re-checked every request
  // since a key outlives a tier change either direction.
  const { data: profile } = await admin.from('profiles').select('subscription_active, subscription_tier').eq('id', key.user_id).maybeSingle();
  const isPro = !!profile?.subscription_active && profile.subscription_tier === 'pro';

  const windowStartMs = Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const { data: requestCount, error: rateErr } = await admin.rpc('data_api_increment_rate', { p_key_id: key.id, p_window_start: new Date(windowStartMs).toISOString() });
  if (rateErr) console.error(JSON.stringify({ evt: 'rate_limit_check_failed', fn: 'data-api', keyId: key.id, error: rateErr.message })); // fail open — a rate-limit hiccup shouldn't take the API down
  const count = rateErr ? 0 : (requestCount as number);
  const resetAt = windowStartMs + RATE_WINDOW_MS;
  const limit: RateLimitResult = {
    allowed: count <= RATE_LIMIT,
    limit: RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - count),
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)),
  };
  const rlHeaders = rateLimitHeaders(limit);
  if (!limit.allowed) {
    console.warn(JSON.stringify({ evt: 'rate_limit_breach', fn: 'data-api', keyId: key.id, count, limit: RATE_LIMIT, ts: new Date().toISOString() }));
    return tooManyRequestsResponse(limit, corsHeaders);
  }

  const url = new URL(req.url); const resource = url.searchParams.get('resource') ?? 'portfolio';

  if (!isPro) {
    const { data: trialCount, error: trialErr } = await admin.rpc('data_api_increment_trial_quota', { p_key_id: key.id });
    if (trialErr) {
      // Fail open, same philosophy as the rate-limit check above — an infra
      // hiccup on the quota table shouldn't take a trial user's request down.
      console.error(JSON.stringify({ evt: 'trial_quota_check_failed', fn: 'data-api', keyId: key.id, error: trialErr.message }));
    } else if ((trialCount as number) > TRIAL_DAILY_LIMIT) {
      console.warn(JSON.stringify({ evt: 'trial_quota_exceeded', fn: 'data-api', keyId: key.id, count: trialCount, ts: new Date().toISOString() }));
      return json({
        error: 'trial_daily_limit_exceeded',
        message: `Free trial is limited to ${TRIAL_DAILY_LIMIT} requests/day. Upgrade to Pro for unlimited requests (60/min).`,
        upgrade_url: 'https://app.commodity-hub.eu/data-api',
      }, 429, rlHeaders);
    }
  }

  runBackground(Promise.resolve(admin.from('data_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id)));
  runBackground(
    Promise.resolve(admin.rpc('data_api_record_usage', { p_key_id: key.id, p_resource: resource })).then(({ error: usageErr }) => {
      if (usageErr) console.error(JSON.stringify({ evt: 'usage_record_failed', fn: 'data-api', keyId: key.id, error: usageErr.message }));
    }),
  );
  if (resource === 'portfolio') {
    const { data, error } = await admin.from('portfolio_positions').select('commodity_name,quantity,entry_price,entry_date,notes,created_at').eq('user_id', key.user_id).order('created_at', { ascending: false });
    return error ? json({ error: 'data_unavailable' }, 500, rlHeaders) : json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
  }
  if (resource === 'watchlists') {
    const { data, error } = await admin.from('watchlists').select('id,name,created_at,watchlist_items(commodity_name,commodity_symbol,position)').eq('user_id', key.user_id).order('created_at', { ascending: false });
    return error ? json({ error: 'data_unavailable' }, 500, rlHeaders) : json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
  }
  if (resource === 'prices') {
    const commodity = url.searchParams.get('commodity');
    const timeframe = url.searchParams.get('timeframe');
    const svc = new CommodityService('data-api');
    if (!commodity) {
      const data = await svc.fetchAllCommodities(true);
      return json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
    }
    if (timeframe) {
      if (!TIMEFRAMES.has(timeframe)) return json({ error: 'invalid_timeframe', valid: Array.from(TIMEFRAMES) }, 400, rlHeaders);
      const data = await svc.fetchCommodityChart(commodity, timeframe);
      return json({ data, commodity, timeframe, generated_at: new Date().toISOString() }, 200, rlHeaders);
    }
    const data = await svc.fetchCurrentPrice(commodity);
    return data ? json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders) : json({ error: 'commodity_not_found' }, 404, rlHeaders);
  }
  if (resource === 'cot') {
    const commodity = url.searchParams.get('commodity');
    if (!commodity) return json({ error: 'commodity_required' }, 400, rlHeaders);
    const requested = Number(url.searchParams.get('limit') ?? 52);
    const rowLimit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_COT_LIMIT) : 52;
    const { data, error } = await admin.from('cot_reports').select('commodity,report_date,managed_money_long,managed_money_short,commercials_long,commercials_short,net_position,open_interest').eq('commodity', commodity).order('report_date', { ascending: false }).limit(rowLimit);
    return error ? json({ error: 'data_unavailable' }, 500, rlHeaders) : json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
  }
  if (resource === 'fundamentals') {
    const seriesId = url.searchParams.get('series_id');
    if (seriesId) {
      const { data, error } = await admin.from('fundamentals_snapshots').select('series_id,dataset,label,unit,observations,latest_value,latest_period,wow_change,yoy_change,five_year_avg,updated_at').eq('series_id', seriesId).maybeSingle();
      if (error) return json({ error: 'data_unavailable' }, 500, rlHeaders);
      return data ? json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders) : json({ error: 'series_not_found' }, 404, rlHeaders);
    }
    const dataset = url.searchParams.get('dataset');
    // List view omits `observations` (can be hundreds of points per series) —
    // fetch a specific series_id for the full time series.
    let query = admin.from('fundamentals_snapshots').select('series_id,dataset,label,unit,latest_value,latest_period,wow_change,yoy_change,five_year_avg,updated_at').order('label');
    if (dataset) query = query.eq('dataset', dataset);
    const { data, error } = await query;
    return error ? json({ error: 'data_unavailable' }, 500, rlHeaders) : json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
  }
  return json({ error: 'unknown_resource' }, 404, rlHeaders);
});
