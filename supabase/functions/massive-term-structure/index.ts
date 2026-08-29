// Term Structure Heatmap — Pro tier.
// Fetches the current forward curve for a product plus reconstructed curves
// from 1 week ago and 1 month ago (using the same contracts' historical
// settlement aggs). Returns 3 aligned series so the UI can show how the
// shape shifted.
//
// Request path is snapshot-first (same pattern as massive-vol-cone): we
// always try to return analytics_snapshots immediately. If the snapshot is
// older than CACHE_TTL_MS we fire a background recompute via
// EdgeRuntime.waitUntil so the next request is fresh. Only the first-ever
// request for a product+horizon blocks on the Massive Futures fetch.
//
// This used to be an in-memory-only cache (a plain Map, reset on every cold
// isolate), which was fine for app traffic but made this function unsafe to
// expose behind the public Data API — a cold isolate on every request would
// have meant every API call could trigger a live Massive Futures fetch, with
// no ceiling beyond the generic per-key rate limit. Persisting to
// analytics_snapshots (like vol-cone and roll-scanner already do) means the
// API can read the cache directly and never triggers a live fetch itself.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveCurve, fetchContractDailyClose } from '../_shared/massive-client.ts';

const PRODUCTS: Record<string, { label: string; code: string }> = {
  wti:      { label: 'WTI Crude',    code: 'CL' },
  brent:    { label: 'Brent Crude',  code: 'BZ' },
  gold:     { label: 'Gold',         code: 'GC' },
  silver:   { label: 'Silver',       code: 'SI' },
  copper:   { label: 'Copper',       code: 'HG' },
  platinum: { label: 'Platinum',     code: 'PL' },
  palladium:{ label: 'Palladium',    code: 'PA' },
  corn:     { label: 'Corn',         code: 'ZC' },
  wheat:    { label: 'Wheat',        code: 'ZW' },
  soybeans: { label: 'Soybeans',     code: 'ZS' },
  cattle:   { label: 'Live Cattle',  code: 'LE' },
  hogs:     { label: 'Lean Hogs',    code: 'HE' },
  lumber:   { label: 'Lumber',       code: 'LBR' },
};

const BodySchema = z.object({
  commodity: z.enum(Object.keys(PRODUCTS) as [string, ...string[]]),
  monthsAhead: z.number().int().min(3).max(18).default(12),
});

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<unknown>>();

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function snapshotKey(commodity: string, monthsAhead: number): string {
  return `${commodity}:${monthsAhead}`;
}

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

async function computeAndStore(
  commodity: string,
  monthsAhead: number,
  admin: ReturnType<typeof createClient<any>>,
  logger: EdgeLogger,
): Promise<Record<string, unknown> | null> {
  const key = snapshotKey(commodity, monthsAhead);
  const existing = inflight.get(key);
  if (existing) return (await existing) as Record<string, unknown> | null;

  const job = (async () => {
    const product = PRODUCTS[commodity];
    let curveResult: { asOf: string; curve: { symbol: string; expiry: string; monthIdx: number; price: number }[] };
    try {
      curveResult = await fetchMassiveCurve(product.code, monthsAhead);
    } catch (e) {
      logger.warn(`term-structure fetch threw for ${product.code}: ${(e as Error).message}`);
      return null;
    }
    const { asOf, curve } = curveResult;
    if (curve.length < 3) {
      logger.warn(`term-structure ${product.code} only ${curve.length} points — skipping`);
      return null;
    }

    const oneWeek = daysAgo(7);
    const oneMonth = daysAgo(30);
    const [weekPrices, monthPrices] = await Promise.all([
      Promise.all(curve.map((c) => fetchContractDailyClose(c.symbol, oneWeek))),
      Promise.all(curve.map((c) => fetchContractDailyClose(c.symbol, oneMonth))),
    ]);

    const points = curve.map((c, i) => ({
      symbol: c.symbol,
      expiry: c.expiry,
      monthIdx: c.monthIdx,
      current: c.price,
      weekAgo: weekPrices[i] != null ? +weekPrices[i]!.toFixed(4) : null,
      monthAgo: monthPrices[i] != null ? +monthPrices[i]!.toFixed(4) : null,
    }));

    const payload = {
      commodity,
      monthsAhead,
      label: product.label,
      provider: 'Massive Futures Starter',
      asOf,
      weekAgoDate: oneWeek,
      monthAgoDate: oneMonth,
      points,
      stale: false,
    };

    const { error } = await admin.from('analytics_snapshots').upsert({
      kind: 'term_structure',
      key,
      payload,
      as_of: new Date().toISOString(),
    });
    if (error) logger.warn(`snapshot upsert failed: ${error.message}`);
    return payload;
  })();

  inflight.set(key, job);
  try {
    return (await job) as Record<string, unknown> | null;
  } finally {
    inflight.delete(key);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'massive-term-structure' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: tierData } = await admin.rpc('get_user_tier', { _user_id: userData.user.id });
    if (tierData !== 'pro') {
      return new Response(JSON.stringify({ error: 'pro_required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { commodity, monthsAhead } = parsed.data;
    const key = snapshotKey(commodity, monthsAhead);

    // Snapshot-first: read whatever we have right now.
    const { data: snap } = await admin
      .from('analytics_snapshots')
      .select('payload, as_of')
      .eq('kind', 'term_structure')
      .eq('key', key)
      .maybeSingle();

    if (snap?.payload) {
      const asOfMs = snap.as_of ? new Date(snap.as_of).getTime() : 0;
      const ageMs = Date.now() - asOfMs;
      const isStale = ageMs >= CACHE_TTL_MS;

      if (isStale) {
        try {
          const refreshJob = computeAndStore(commodity, monthsAhead, admin, logger);
          if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
            EdgeRuntime.waitUntil(refreshJob);
          }
        } catch (e) {
          logger.warn(`background refresh kickoff failed: ${(e as Error).message}`);
        }
      }

      const payload = {
        ...(snap.payload as Record<string, unknown>),
        stale: isStale,
        asOf: (snap.payload as { asOf?: string })?.asOf ?? snap.as_of,
      };
      return new Response(JSON.stringify(payload), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Cache': isStale ? 'STALE' : 'FRESH',
        },
      });
    }

    // No snapshot yet — block on the first compute.
    const fresh = await computeAndStore(commodity, monthsAhead, admin, logger);
    if (!fresh) {
      return new Response(JSON.stringify({ error: 'curve_unavailable' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(fresh), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    logger.error('term-structure failed', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
