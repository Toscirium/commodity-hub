// Fetch CME futures-options data via Databento (GLBX.MDP3 dataset).
//
// Replaces the previous CME public-JSON scraper: that approach violated
// CME's Terms of Use (automated access to their quote-widget endpoints) and
// was fragile (CME rotates that schema periodically). Databento is a
// licensed redistributor of the same underlying CME Globex feed.
//
// Databento is raw tick/reference data, not a pre-built "chain" endpoint,
// so this joins two schemas client-side:
//   1. `definition` (stype_in=parent, symbols=`${root}.OPT`) — the universe
//      of live option instruments for the product root: strike, expiration,
//      call/put, instrument_id.
//   2. `statistics` (stype_in=instrument_id) — settlement price, open
//      interest, volume, and (if CME publishes it) implied vol/delta, for
//      the specific instruments in the selected expiration.
//
// Field names/types below come from the open-source `dbn` record
// definitions (github.com/databento/dbn: enums.rs, record.rs) and the
// databento-python HTTP client source — NOT a live test call, since no API
// key was available while writing this. Verify against a real response
// once DATABENTO_API_KEY is set, in particular:
//   - whether `encoding: 'json'` returns newline-delimited JSON or a JSON
//     array (parseRecords() below handles both)
//   - whether header fields (instrument_id, ts_recv) are flattened onto
//     each JSON record or nested under `hd` (fieldNum() checks both)
//   - whether CME actually publishes IV/delta stats (stat_type 14/15) for
//     these products — if not, callIV/putIV stay null and the frontend
//     falls back to the app's own black76()/impliedVol() solver

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from '../_shared/utils.ts';
import { IpRateLimiter, tooManyRequestsResponse } from '../_shared/rateLimit.ts';
import { safeLog } from '../_shared/safeConsole.ts';
import { fetchMassiveFrontMonth } from '../_shared/massive-client.ts';

const DATABENTO_BASE = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3';

// `product` is the futures root (same codes as MASSIVE_PRODUCT_CODES in
// _shared/commodity-mappings.ts, used for the underlying futures price
// below) but CME lists options on a *separate* product root — Databento's
// parent symbology ("Could not resolve smart symbols: CL.OPT") confirmed
// `${product}.OPT` doesn't resolve. `optionsRoot` is the actual CME options
// root (verified against a live Databento definition call), same codes the
// old CME-scraper's PRODUCT_IDS used pre-Databento.
const PRODUCT_ROOTS: Record<string, { optionsRoot: string; label: string }> = {
  CL: { optionsRoot: 'LO', label: 'WTI Crude Oil Options' },
  NG: { optionsRoot: 'LNE', label: 'Natural Gas Options' },
  GC: { optionsRoot: 'OG', label: 'Gold Options' },
  ZC: { optionsRoot: 'OZC', label: 'Corn Options' },
  ZS: { optionsRoot: 'OZS', label: 'Soybean Options' },
};

const BodySchema = z.object({
  product: z.enum(['CL', 'NG', 'GC', 'ZC', 'ZS']),
  expiration: z.string().max(16).optional(),
});

type Expiration = { code: string; label: string; expirationDate?: string };
type ChainRow = {
  strike: number;
  callSettle: number | null;
  callVolume: number | null;
  callOpenInterest: number | null;
  putSettle: number | null;
  putVolume: number | null;
  putOpenInterest: number | null;
  callIV: number | null;
  putIV: number | null;
};
type ChainPayload = {
  product: string;
  productLabel: string;
  expirations: Expiration[];
  expiration: string;
  expirationDate: string | null;
  underlying: number | null;
  tradeDate: string | null;
  rows: ChainRow[];
};

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — settlements are daily
const limiter = new IpRateLimiter({ limit: 30, windowMs: 60_000 });

const StatType = { SETTLEMENT: 3, CLEARED_VOLUME: 6, OPEN_INTEREST: 9, VOLATILITY: 14, DELTA: 15 } as const;

// DBN's UNDEF_PRICE/UNDEF_STAT_QUANTITY/UNDEF_TIMESTAMP sentinels are near
// i64::MAX. JS loses precision on integers that large, so this is a
// magnitude check rather than an exact match.
const I64_SENTINEL = 9_223_372_036_854_770_000;

/** Fixed-price DBN field: 1 unit = 1e-9. */
function fixedPrice(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= I64_SENTINEL) return null;
  return n / 1e9;
}

function safeQuantity(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= I64_SENTINEL) return null;
  return n;
}

function nanosToMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= I64_SENTINEL) return null;
  return n / 1e6;
}

/**
 * Parses a Databento JSON-encoded timeseries response. Handles both
 * newline-delimited JSON (the streaming default for most APIs like this)
 * and a plain JSON array, since this hasn't been confirmed against a live
 * response yet.
 */
function parseRecords(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((r): r is Record<string, unknown> => !!r);
}

/** Reads a field from the top level of a record, or from a nested `hd` (header). */
function fieldNum(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined) return rec[k];
  }
  const hd = rec.hd as Record<string, unknown> | undefined;
  if (hd) {
    for (const k of keys) {
      if (hd[k] !== undefined) return hd[k];
    }
  }
  return undefined;
}

async function databentoGetRange(
  apiKey: string,
  params: {
    schema: 'definition' | 'statistics';
    symbols: string;
    stypeIn: 'parent' | 'instrument_id';
    start: string;
    end: string;
  },
): Promise<Record<string, unknown>[]> {
  const body = new URLSearchParams({
    dataset: DATASET,
    schema: params.schema,
    symbols: params.symbols,
    stype_in: params.stypeIn,
    stype_out: 'instrument_id',
    start: params.start,
    end: params.end,
    encoding: 'json',
  });
  const res = await fetch(`${DATABENTO_BASE}/timeseries.get_range`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${apiKey}:`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Databento ${params.schema} request failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return parseRecords(await res.text());
}

interface OptionDef {
  instrumentId: string;
  strike: number;
  right: 'C' | 'P';
  expirationMs: number;
}

async function fetchDefinitions(apiKey: string, root: string, start: string, end: string): Promise<OptionDef[]> {
  const recs = await databentoGetRange(apiKey, {
    schema: 'definition',
    symbols: `${root}.OPT`,
    stypeIn: 'parent',
    start,
    end,
  });
  const byId = new Map<string, OptionDef & { tsRecv: number }>();
  for (const rec of recs) {
    const cls = String(rec.instrument_class ?? '');
    if (cls !== 'C' && cls !== 'P') continue; // skip spreads/combos
    const instrumentId = String(fieldNum(rec, 'instrument_id') ?? '');
    const strike = fixedPrice(rec.strike_price);
    const expirationMs = nanosToMs(rec.expiration);
    if (!instrumentId || strike == null || expirationMs == null) continue;
    const tsRecv = Number(fieldNum(rec, 'ts_recv') ?? 0);
    const existing = byId.get(instrumentId);
    if (existing && existing.tsRecv >= tsRecv) continue; // keep latest definition per instrument
    byId.set(instrumentId, { instrumentId, strike, right: cls as 'C' | 'P', expirationMs, tsRecv });
  }
  return [...byId.values()];
}

interface OptionStats {
  settle: number | null;
  volume: number | null;
  openInterest: number | null;
  iv: number | null;
}

async function fetchStatistics(
  apiKey: string,
  instrumentIds: string[],
  start: string,
  end: string,
): Promise<Map<string, OptionStats>> {
  const out = new Map<string, OptionStats>();
  if (instrumentIds.length === 0) return out;
  // Databento allows up to 2,000 symbols/request; a single expiration's
  // strikes comfortably fit in one call.
  const recs = await databentoGetRange(apiKey, {
    schema: 'statistics',
    symbols: instrumentIds.join(','),
    stypeIn: 'instrument_id',
    start,
    end,
  });
  const latestPerType = new Map<string, Map<number, number>>();
  for (const rec of recs) {
    const instrumentId = String(fieldNum(rec, 'instrument_id') ?? '');
    if (!instrumentId) continue;
    const statType = Number(rec.stat_type);
    const tsRecv = Number(fieldNum(rec, 'ts_recv') ?? 0);

    if (!out.has(instrumentId)) {
      out.set(instrumentId, { settle: null, volume: null, openInterest: null, iv: null });
    }
    if (!latestPerType.has(instrumentId)) latestPerType.set(instrumentId, new Map());
    const seenAt = latestPerType.get(instrumentId)!;
    const prevTs = seenAt.get(statType) ?? -1;
    if (tsRecv < prevTs) continue; // keep only the most recent record per stat type
    seenAt.set(statType, tsRecv);

    const entry = out.get(instrumentId)!;
    switch (statType) {
      case StatType.SETTLEMENT: entry.settle = fixedPrice(rec.price); break;
      case StatType.OPEN_INTEREST: entry.openInterest = safeQuantity(rec.quantity); break;
      case StatType.CLEARED_VOLUME: entry.volume = safeQuantity(rec.quantity); break;
      case StatType.VOLATILITY: entry.iv = fixedPrice(rec.price); break;
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const rateLimit = limiter.check(IpRateLimiter.getClientIp(req));
  if (!rateLimit.allowed) return tooManyRequestsResponse(rateLimit, corsHeaders);

  try {
    // Options analytics is a Pro feature — same pattern as pro-analytics/index.ts.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: tierData, error: tierError } = await admin.rpc('get_user_tier', { _user_id: userData.user.id });
    if (tierError || tierData !== 'pro') {
      return new Response(JSON.stringify({ error: 'Pro tier required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { product } = parsed.data;
    const meta = PRODUCT_ROOTS[product];
    if (!meta) {
      return new Response(JSON.stringify({ error: 'Unsupported product' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('DATABENTO_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Options data source not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey = `${product}:${parsed.data.expiration ?? 'front'}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return new Response(JSON.stringify({ ...(hit.data as object), cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // `definition` is a full daily universe snapshot (every live strike ×
    // expiration for the root — thousands of instruments for a liquid
    // product like LO). A wide date range multiplies that per included day
    // and blew past the edge function's compute budget (WORKER_RESOURCE_LIMIT)
    // when this was fetched over a flat 10-day window. Default to a narrow
    // 2-day window (covers an ordinary weekend) and only widen to cover
    // holidays if that comes back empty, so the common case stays cheap.
    const end = new Date();
    const endStr = end.toISOString().slice(0, 10);
    const windowStart = (days: number) => new Date(end.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    let lookbackDays = 2;
    let defs = await fetchDefinitions(apiKey, meta.optionsRoot, windowStart(lookbackDays), endStr);
    if (defs.length === 0) {
      lookbackDays = 8;
      defs = await fetchDefinitions(apiKey, meta.optionsRoot, windowStart(lookbackDays), endStr);
    }
    if (defs.length === 0) {
      return new Response(JSON.stringify({
        error: 'Databento returned no live option instruments for this product',
        product, productLabel: meta.label,
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const startStr = windowStart(lookbackDays);

    // Group by expiration date.
    const byExpiration = new Map<string, OptionDef[]>();
    for (const d of defs) {
      const code = new Date(d.expirationMs).toISOString().slice(0, 10);
      const arr = byExpiration.get(code) ?? [];
      arr.push(d);
      byExpiration.set(code, arr);
    }
    const sortedCodes = [...byExpiration.keys()].sort();
    const expirations: Expiration[] = sortedCodes.map((code) => ({
      code,
      label: new Date(code).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
      expirationDate: code,
    }));
    const expCode = parsed.data.expiration && byExpiration.has(parsed.data.expiration)
      ? parsed.data.expiration
      : sortedCodes[0];
    const chainDefs = byExpiration.get(expCode) ?? [];

    const stats = await fetchStatistics(apiKey, chainDefs.map((d) => d.instrumentId), startStr, endStr);

    const byStrike = new Map<number, ChainRow>();
    for (const d of chainDefs) {
      let row = byStrike.get(d.strike);
      if (!row) {
        row = {
          strike: d.strike,
          callSettle: null, callVolume: null, callOpenInterest: null, callIV: null,
          putSettle: null, putVolume: null, putOpenInterest: null, putIV: null,
        };
        byStrike.set(d.strike, row);
      }
      const s = stats.get(d.instrumentId);
      if (d.right === 'C') {
        row.callSettle = s?.settle ?? null;
        row.callVolume = s?.volume ?? null;
        row.callOpenInterest = s?.openInterest ?? null;
        row.callIV = s?.iv ?? null;
      } else {
        row.putSettle = s?.settle ?? null;
        row.putVolume = s?.volume ?? null;
        row.putOpenInterest = s?.openInterest ?? null;
        row.putIV = s?.iv ?? null;
      }
    }
    const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);

    // Reuse the app's existing Massive Futures front-month price rather
    // than spending an extra Databento query on the outright future.
    let underlying: number | null = null;
    try {
      const fm = await fetchMassiveFrontMonth(product);
      underlying = fm?.price ?? null;
    } catch (err) {
      safeLog.warn(`Massive front-month lookup failed for ${product}`, err);
    }

    const payload: ChainPayload = {
      product,
      productLabel: meta.label,
      expirations,
      expiration: expCode,
      expirationDate: expCode,
      underlying,
      tradeDate: endStr,
      rows,
    };
    cache.set(cacheKey, { at: Date.now(), data: payload });
    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    safeLog.error('Error in fetch-options-chain function:', e);
    return new Response(JSON.stringify({ error: 'Internal error', message: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
