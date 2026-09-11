// Resource fetchers shared between the two protocols we speak over the same
// underlying data: the REST Data API (`data-api/index.ts`) and the MCP server
// (`mcp/index.ts`). Both authenticate the same `ch_live_` key against the same
// `data_api_keys` table and apply the same rate limit/trial quota, then hand
// off here — this module is deliberately protocol-agnostic (no Request/Response
// types), just "params in, {status, body} out", so a JSON-RPC tool call and a
// REST query string can both call the exact same function and get the exact
// same answer. See docs/IBKR_INTEGRATION_OPTIONS.md Option B for why MCP
// exists at all.
//
// Extracted from data-api/index.ts 2026-09 rather than duplicated — the two
// callers were drifting-in-waiting the moment someone fixed a bug in only one
// of them.
import { CommodityService } from './commodity-service.ts';

// deno-lint-ignore no-explicit-any
type AdminClient = any; // the supabase-js client — typed `any` here rather than
// importing SupabaseClient's generic type machinery, matching how the rest of
// _shared already treats it (see commodity-service.ts).

export interface ResourceCtx {
  admin: AdminClient;
  userId: string;
  isPro: boolean;
  isPremiumOrPro: boolean;
}

export interface ResourceResult {
  status: number;
  body: Record<string, unknown>;
}

const now = () => new Date().toISOString();
const ok = (body: Record<string, unknown>): ResourceResult => ({ status: 200, body: { ...body, generated_at: now() } });
const err = (status: number, body: Record<string, unknown>): ResourceResult => ({ status, body });

// Raised 2026-08-27 from 260 (5yr) — a ceiling on what a request can ask for,
// not a claim about how much history actually exists. cot_reports is
// currently populated back to 2019 (~340 weeks); this just stops the cap
// itself from being the limiting factor if/when older data gets backfilled.
export const MAX_COT_LIMIT = 520; // 10 years of weekly reports
export const MAX_NEWS_LIMIT = 100;
export const TIMEFRAMES = new Set(['1d', '1m', '3m', '6m', '1y', '2y']); // matches api-docs' ChartDataPoint enum
// Curve/positioning analytics use short slugs (wti, brent, ...), NOT the full
// display names `prices`/`cot` take ("WTI Crude Oil") — this mirrors the
// massive-vol-cone/massive-term-structure functions' own PRODUCTS keys
// exactly, since these resources are pure readers of the snapshots those
// functions write.
export const MASSIVE_PRODUCTS = new Set([
  'wti', 'brent', 'gold', 'silver', 'copper', 'platinum', 'palladium',
  'corn', 'wheat', 'soybeans', 'cattle', 'hogs', 'lumber',
]);
export const MONTHS_AHEAD_DEFAULT = 12;
export const MONTHS_AHEAD_MIN = 3;
export const MONTHS_AHEAD_MAX = 18;
// vol_cone / roll_scanner / term_structure never trigger a live Massive
// Futures fetch — they only ever read analytics_snapshots (the same cache
// massive-vol-cone/-term-structure/-roll-scanner already persist to for the
// in-app Pro UI). A caller must never be able to drive cost on a paid
// third-party provider merely by asking; if nobody has opened that feature
// in-app recently, the snapshot may be older than the 6h TTL those functions
// use, or may not exist yet at all — both surfaced honestly (`stale`/`as_of`,
// or `snapshot_not_available`) rather than papered over with a live fetch.
export const ANALYTICS_SNAPSHOT_STALE_MS = 6 * 60 * 60 * 1000;

export async function resourcePortfolio(ctx: ResourceCtx): Promise<ResourceResult> {
  const { data, error } = await ctx.admin
    .from('portfolio_positions')
    .select('commodity_name,quantity,entry_price,entry_date,notes,created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourceWatchlists(ctx: ResourceCtx): Promise<ResourceResult> {
  const { data, error } = await ctx.admin
    .from('watchlists')
    .select('id,name,created_at,watchlist_items(commodity_name,commodity_symbol,position)')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourceAlerts(ctx: ResourceCtx): Promise<ResourceResult> {
  // Same shape as portfolio/watchlists: the caller's own rows, scoped by
  // userId since this connection uses the service role and bypasses
  // price_alerts' RLS entirely. Read-only for now — the rest of the API is
  // read-only too, and a write path (create/delete an alert) needs its own
  // validation and idempotency story that isn't built yet.
  const { data, error } = await ctx.admin
    .from('price_alerts')
    .select('id,commodity_name,commodity_symbol,condition,target_price,is_active,last_triggered_at,cooldown_minutes,note,created_at')
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false });
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourcePrices(
  _ctx: ResourceCtx,
  params: { commodity?: string; timeframe?: string },
): Promise<ResourceResult> {
  const svc = new CommodityService('data-api');
  if (!params.commodity) {
    const data = await svc.fetchAllCommodities(true);
    return ok({ data });
  }
  if (params.timeframe) {
    if (!TIMEFRAMES.has(params.timeframe)) return err(400, { error: 'invalid_timeframe', valid: Array.from(TIMEFRAMES) });
    const data = await svc.fetchCommodityChart(params.commodity, params.timeframe);
    return ok({ data, commodity: params.commodity, timeframe: params.timeframe });
  }
  const data = await svc.fetchCurrentPrice(params.commodity);
  return data ? ok({ data }) : err(404, { error: 'commodity_not_found' });
}

export async function resourceCot(
  ctx: ResourceCtx,
  params: { commodity?: string; limit?: number },
): Promise<ResourceResult> {
  if (!params.commodity) return err(400, { error: 'commodity_required' });
  const requested = params.limit ?? 52;
  const rowLimit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_COT_LIMIT) : 52;
  const { data, error } = await ctx.admin
    .from('cot_reports')
    .select('commodity,report_date,managed_money_long,managed_money_short,commercials_long,commercials_short,net_position,open_interest')
    .eq('commodity', params.commodity)
    .order('report_date', { ascending: false })
    .limit(rowLimit);
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourceFundamentals(
  ctx: ResourceCtx,
  params: { seriesId?: string; dataset?: string },
): Promise<ResourceResult> {
  if (params.seriesId) {
    const { data, error } = await ctx.admin
      .from('fundamentals_snapshots')
      .select('series_id,dataset,label,unit,observations,latest_value,latest_period,wow_change,yoy_change,five_year_avg,updated_at')
      .eq('series_id', params.seriesId)
      .maybeSingle();
    if (error) return err(500, { error: 'data_unavailable' });
    return data ? ok({ data }) : err(404, { error: 'series_not_found' });
  }
  // List view omits `observations` (can be hundreds of points per series) —
  // fetch a specific series_id for the full time series.
  let query = ctx.admin
    .from('fundamentals_snapshots')
    .select('series_id,dataset,label,unit,latest_value,latest_period,wow_change,yoy_change,five_year_avg,updated_at')
    .order('label');
  if (params.dataset) query = query.eq('dataset', params.dataset);
  const { data, error } = await query;
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourceSentiment(
  ctx: ResourceCtx,
  params: { commodity?: string },
): Promise<ResourceResult> {
  // Community bullish/bearish votes — public in the app (RLS: "viewable by
  // everyone"), so no tier gate here either.
  let query = ctx.admin
    .from('sentiment_aggregates')
    .select('commodity_name,bullish_votes,bearish_votes,total_votes,average_confidence,last_updated')
    .order('commodity_name');
  if (params.commodity) query = query.eq('commodity_name', params.commodity);
  const { data, error } = await query;
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourceNews(
  ctx: ResourceCtx,
  params: { category?: string; limit?: number },
): Promise<ResourceResult> {
  // commodity_news_feed is Premium/Pro-gated in the app (its own RLS policy)
  // — re-enforced by hand here since the service role bypasses that policy.
  // A free/trial key gets a clear 403, not an empty array.
  if (!ctx.isPremiumOrPro) {
    return err(403, {
      error: 'premium_required',
      message: 'The news resource requires an active Premium or Pro subscription.',
      upgrade_url: 'https://app.commodity-hub.eu/data-api',
    });
  }
  const requested = params.limit ?? 20;
  const rowLimit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_NEWS_LIMIT) : 20;
  let query = ctx.admin
    .from('commodity_news_feed')
    .select('title,description,url,source_name,category,published_at')
    .order('published_at', { ascending: false })
    .limit(rowLimit);
  if (params.category) query = query.eq('category', params.category);
  const { data, error } = await query;
  return error ? err(500, { error: 'data_unavailable' }) : ok({ data });
}

export async function resourceAnalyticsSnapshot(
  ctx: ResourceCtx,
  resource: 'vol_cone' | 'roll_scanner' | 'term_structure',
  params: { commodity?: string; monthsAhead?: number },
): Promise<ResourceResult> {
  // Pro-only, matching massive-vol-cone/-roll-scanner/-term-structure's own
  // get_user_tier() !== 'pro' gate in-app.
  if (!ctx.isPro) {
    return err(403, {
      error: 'pro_required',
      message: `The ${resource} resource requires an active Pro subscription.`,
      upgrade_url: 'https://app.commodity-hub.eu/data-api',
    });
  }

  if (resource === 'roll_scanner') {
    // Full-universe scan, no per-commodity param — same as the in-app version.
    const { data: snap, error } = await ctx.admin
      .from('analytics_snapshots')
      .select('payload, as_of')
      .eq('kind', 'roll_scanner')
      .eq('key', 'all')
      .maybeSingle();
    if (error) return err(500, { error: 'data_unavailable' });
    if (!snap?.payload) return err(404, { error: 'snapshot_not_available', message: 'No roll scanner data has been computed yet.' });
    const isStale = Date.now() - new Date(snap.as_of).getTime() >= ANALYTICS_SNAPSHOT_STALE_MS;
    return ok({ data: { ...(snap.payload as Record<string, unknown>), stale: isStale } });
  }

  // vol_cone and term_structure both take a required `commodity` slug.
  if (!params.commodity) return err(400, { error: 'commodity_required', valid: Array.from(MASSIVE_PRODUCTS) });
  if (!MASSIVE_PRODUCTS.has(params.commodity)) return err(400, { error: 'invalid_commodity', valid: Array.from(MASSIVE_PRODUCTS) });

  let snapshotKey: string = params.commodity;
  if (resource === 'term_structure') {
    const requestedMonths = params.monthsAhead ?? MONTHS_AHEAD_DEFAULT;
    const monthsAhead = Number.isInteger(requestedMonths) && requestedMonths >= MONTHS_AHEAD_MIN && requestedMonths <= MONTHS_AHEAD_MAX
      ? requestedMonths
      : null;
    if (monthsAhead === null) return err(400, { error: 'invalid_months_ahead', min: MONTHS_AHEAD_MIN, max: MONTHS_AHEAD_MAX });
    snapshotKey = `${params.commodity}:${monthsAhead}`; // must match massive-term-structure's own key format exactly
  }

  const { data: snap, error } = await ctx.admin
    .from('analytics_snapshots')
    .select('payload, as_of')
    .eq('kind', resource)
    .eq('key', snapshotKey)
    .maybeSingle();
  if (error) return err(500, { error: 'data_unavailable' });
  if (!snap?.payload) {
    return err(404, { error: 'snapshot_not_available', message: `No ${resource} data has been computed yet for ${params.commodity}. Open it in the app once to seed it.` });
  }
  const isStale = Date.now() - new Date(snap.as_of).getTime() >= ANALYTICS_SNAPSHOT_STALE_MS;
  return ok({ data: { ...(snap.payload as Record<string, unknown>), stale: isStale } });
}
