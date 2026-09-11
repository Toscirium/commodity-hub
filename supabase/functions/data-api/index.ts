import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';
import { rateLimitHeaders, tooManyRequestsResponse, type RateLimitResult } from '../_shared/rateLimit.ts';
import {
  resourcePortfolio, resourceWatchlists, resourcePrices, resourceCot,
  resourceFundamentals, resourceAlerts, resourceSentiment, resourceNews,
  resourceAnalyticsSnapshot, type ResourceCtx, type ResourceResult,
} from '../_shared/dataApiResources.ts';

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
// Requests/day for a key whose owner isn't on an active Pro subscription —
// lets a prospect evaluate the API for real before paying anything, instead
// of requiring a full Pro subscription just to see a response. Pro keys are
// exempt (RATE_LIMIT/RATE_WINDOW_MS above is their only cap). Chosen to
// land in the same range competitors' free tiers use (OilPriceAPI: 50/day,
// CommodityFundamentals: 1,000/day) without being generous enough to
// substitute for actually subscribing.
const TRIAL_DAILY_LIMIT = 50;
// Resource-specific limits/enums (TIMEFRAMES, MAX_COT_LIMIT, MASSIVE_PRODUCTS,
// ...) live in dataApiResources.ts now — this function only owns auth, rate
// limiting, and the trial quota; the mcp/index.ts server shares the same
// resource module and the same limits.

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
  // news mirrors commodity_news_feed's own RLS (premium OR pro) — that
  // policy never applies here since this function reads with the service
  // role, so it's re-checked by hand to keep the API's access boundary
  // identical to the app's.
  const isPremiumOrPro = !!profile?.subscription_active && (profile.subscription_tier === 'premium' || profile.subscription_tier === 'pro');

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
  const ctx: ResourceCtx = { admin, userId: key.user_id, isPro, isPremiumOrPro };
  const respond = (r: ResourceResult) => json(r.body, r.status, rlHeaders);

  if (resource === 'portfolio') return respond(await resourcePortfolio(ctx));
  if (resource === 'watchlists') return respond(await resourceWatchlists(ctx));
  if (resource === 'prices') {
    return respond(await resourcePrices(ctx, {
      commodity: url.searchParams.get('commodity') ?? undefined,
      timeframe: url.searchParams.get('timeframe') ?? undefined,
    }));
  }
  if (resource === 'cot') {
    return respond(await resourceCot(ctx, {
      commodity: url.searchParams.get('commodity') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 52),
    }));
  }
  if (resource === 'fundamentals') {
    return respond(await resourceFundamentals(ctx, {
      seriesId: url.searchParams.get('series_id') ?? undefined,
      dataset: url.searchParams.get('dataset') ?? undefined,
    }));
  }
  if (resource === 'alerts') return respond(await resourceAlerts(ctx));
  if (resource === 'sentiment') {
    return respond(await resourceSentiment(ctx, { commodity: url.searchParams.get('commodity') ?? undefined }));
  }
  if (resource === 'news') {
    return respond(await resourceNews(ctx, {
      category: url.searchParams.get('category') ?? undefined,
      limit: Number(url.searchParams.get('limit') ?? 20),
    }));
  }
  if (resource === 'vol_cone' || resource === 'roll_scanner' || resource === 'term_structure') {
    return respond(await resourceAnalyticsSnapshot(ctx, resource, {
      commodity: url.searchParams.get('commodity') ?? undefined,
      monthsAhead: url.searchParams.get('months_ahead') ? Number(url.searchParams.get('months_ahead')) : undefined,
    }));
  }
  return json({ error: 'unknown_resource' }, 404, rlHeaders);
});
