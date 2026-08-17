import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';
import { IpRateLimiter, rateLimitHeaders, tooManyRequestsResponse, logRateLimitBreach } from '../_shared/rateLimit.ts';

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((v) => v.toString(16).padStart(2, '0')).join('');
const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, ...extraHeaders, 'Content-Type': 'application/json' } });

// Per-key limit, not per-IP: a quant shop hitting this from one server IP
// should still get the full budget. 60 req/min is generous for polling a
// data feed while keeping a leaked/shared key from hammering the DB.
// (Same per-isolate caveat as api-docs' limiter — see rateLimit.ts.)
const limiter = new IpRateLimiter({ limit: 60, windowMs: 60_000 });
const MAX_COT_LIMIT = 260; // 5 years of weekly reports

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!raw.startsWith('ch_live_')) return json({ error: 'api_key_required' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: key } = await admin.from('data_api_keys').select('id,user_id').eq('key_hash', await hash(raw)).is('revoked_at', null).maybeSingle();
  if (!key) return json({ error: 'invalid_api_key' }, 401);
  // Keys are only issued to Pro subscribers (see export-center), but a key
  // outlives a downgrade unless we re-check tier on every request here.
  const { data: profile } = await admin.from('profiles').select('subscription_active, subscription_tier').eq('id', key.user_id).maybeSingle();
  if (!profile?.subscription_active || profile.subscription_tier !== 'pro') return json({ error: 'pro_required' }, 403);

  const limit = limiter.check(key.id);
  const rlHeaders = rateLimitHeaders(limit);
  if (!limit.allowed) {
    await logRateLimitBreach('data-api', key.id, limit, req, limiter);
    return tooManyRequestsResponse(limit, corsHeaders);
  }

  await admin.from('data_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
  const url = new URL(req.url); const resource = url.searchParams.get('resource') ?? 'portfolio';
  if (resource === 'portfolio') {
    const { data, error } = await admin.from('portfolio_positions').select('commodity_name,quantity,entry_price,entry_date,notes,created_at').eq('user_id', key.user_id).order('created_at', { ascending: false });
    return error ? json({ error: 'data_unavailable' }, 500, rlHeaders) : json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
  }
  if (resource === 'watchlists') {
    const { data, error } = await admin.from('watchlists').select('id,name,created_at,watchlist_items(commodity_name,commodity_symbol,position)').eq('user_id', key.user_id).order('created_at', { ascending: false });
    return error ? json({ error: 'data_unavailable' }, 500, rlHeaders) : json({ data, generated_at: new Date().toISOString() }, 200, rlHeaders);
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
