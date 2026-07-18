// Historical Volatility Cone — Pro tier.
// Computes annualized realized volatility over rolling windows (10/20/60/120 days)
// for a single product's front-month, plus historical percentile distribution
// (min / p25 / median / p75 / max) over the last ~5y of daily bars.
//
// Request path is snapshot-first: we always try to return analytics_snapshots
// immediately. If the snapshot is older than CACHE_TTL_MS we fire a background
// recompute via EdgeRuntime.waitUntil so the next request is fresh. Only the
// first-ever request for a product blocks on the Massive Futures fetch.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveFrontMonthBars } from '../_shared/massive-client.ts';

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

const WINDOWS = [10, 20, 60, 120] as const;

const BodySchema = z.object({
  commodity: z.enum(Object.keys(PRODUCTS) as [string, ...string[]]),
});

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<unknown>>();

function rollingVol(closes: number[], window: number): number[] {
  if (closes.length < window + 1) return [];
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const out: number[] = [];
  for (let i = window; i <= rets.length; i++) {
    const slice = rets.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
    out.push(Math.sqrt(variance) * Math.sqrt(252) * 100); // annualized %
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

async function computeAndStore(
  commodity: string,
  admin: ReturnType<typeof createClient>,
  logger: EdgeLogger,
): Promise<Record<string, unknown> | null> {
  // Deduplicate concurrent recomputes for the same product.
  const existing = inflight.get(commodity);
  if (existing) return (await existing) as Record<string, unknown> | null;

  const job = (async () => {
    const product = PRODUCTS[commodity];
    const today = new Date();
    const from = new Date(today.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
    let bars: { date: string; close: number }[] = [];
    try {
      bars = await fetchMassiveFrontMonthBars(
        product.code,
        from.toISOString().slice(0, 10),
        today.toISOString().slice(0, 10),
      );
    } catch (e) {
      logger.warn(`vol-cone fetch threw for ${product.code}: ${(e as Error).message}`);
      return null;
    }
    if (bars.length < 30) {
      logger.warn(`vol-cone ${product.code} only ${bars.length} bars — skipping`);
      return null;
    }

    const closes = bars.map((b) => b.close);

    const cone = WINDOWS.map((w) => {
      // Need at least window + 21 returns to get a usable distribution.
      if (closes.length < w + 22) {
        return {
          window: w,
          current: null,
          min: null,
          p25: null,
          median: null,
          p75: null,
          max: null,
          note: 'insufficient_history',
        } as const;
      }
      const series = rollingVol(closes, w);
      const sorted = [...series].sort((a, b) => a - b);
      return {
        window: w,
        current: +series[series.length - 1].toFixed(2),
        min: +percentile(sorted, 0).toFixed(2),
        p25: +percentile(sorted, 0.25).toFixed(2),
        median: +percentile(sorted, 0.5).toFixed(2),
        p75: +percentile(sorted, 0.75).toFixed(2),
        max: +percentile(sorted, 1).toFixed(2),
      };
    });

    // Headline number: prefer 20d, fall back to 10d, else null.
    let headlineWindow: 10 | 20 | null = null;
    let series: number[] = [];
    if (closes.length >= 22) {
      series = rollingVol(closes, 20);
      headlineWindow = 20;
    } else if (closes.length >= 12) {
      series = rollingVol(closes, 10);
      headlineWindow = 10;
    }
    let currentVol: number | null = null;
    let percentile1y: number | null = null;
    if (series.length > 0) {
      const last252 = series.slice(-252);
      const sorted252 = [...last252].sort((a, b) => a - b);
      currentVol = +series[series.length - 1].toFixed(2);
      const rank = sorted252.findIndex((v) => v >= currentVol!);
      percentile1y = rank < 0 ? 100 : Math.round((rank / sorted252.length) * 100);
    }

    const payload = {
      commodity,
      label: product.label,
      provider: 'Massive Futures Starter',
      asOf: bars[bars.length - 1].date,
      bars: bars.length,
      cone,
      currentVol,
      percentile1y,
      headlineWindow,
      stale: false,
    };

    const { error } = await admin.from('analytics_snapshots').upsert({
      kind: 'vol_cone',
      key: commodity,
      payload,
      as_of: new Date().toISOString(),
    });
    if (error) logger.warn(`snapshot upsert failed: ${error.message}`);
    return payload;
  })();

  inflight.set(commodity, job);
  try {
    return (await job) as Record<string, unknown> | null;
  } finally {
    inflight.delete(commodity);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'massive-vol-cone' });

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
    const { commodity } = parsed.data;

    // Snapshot-first: read whatever we have right now.
    const { data: snap } = await admin
      .from('analytics_snapshots')
      .select('payload, as_of')
      .eq('kind', 'vol_cone')
      .eq('key', commodity)
      .maybeSingle();

    if (snap?.payload) {
      const asOfMs = snap.as_of ? new Date(snap.as_of).getTime() : 0;
      const ageMs = Date.now() - asOfMs;
      const isStale = ageMs >= CACHE_TTL_MS;

      // Kick off a background refresh if the snapshot is stale.
      if (isStale) {
        try {
          const refreshJob = computeAndStore(commodity, admin, logger);
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
    const fresh = await computeAndStore(commodity, admin, logger);
    if (!fresh) {
      return new Response(JSON.stringify({ error: 'insufficient_history' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify(fresh), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    logger.error('vol-cone failed', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});