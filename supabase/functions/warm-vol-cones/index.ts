// Cron-driven warmer for the Volatility Cone analytics_snapshots.
// Iterates every supported product sequentially so we don't hammer Massive,
// catches per-product failures, and refreshes the analytics_snapshots row.
//
// Triggered by pg_cron every 4h with header `X-Cron-Secret: ALERT_EVALUATOR_SECRET`
// (re-using the existing cron secret rather than introducing a new one).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
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

function rollingVol(closes: number[], window: number): number[] {
  if (closes.length < window + 1) return [];
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const out: number[] = [];
  for (let i = window; i <= rets.length; i++) {
    const slice = rets.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / (slice.length - 1);
    out.push(Math.sqrt(variance) * Math.sqrt(252) * 100);
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

async function refreshOne(
  commodity: string,
  product: { label: string; code: string },
  admin: ReturnType<typeof createClient>,
  logger: EdgeLogger,
): Promise<'ok' | 'thin' | 'error'> {
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
    logger.warn(`warm: ${product.code} fetch threw: ${(e as Error).message}`);
    return 'error';
  }
  if (bars.length < 30) {
    logger.warn(`warm: ${product.code} only ${bars.length} bars, skipping`);
    return 'thin';
  }
  const closes = bars.map((b) => b.close);
  const cone = WINDOWS.map((w) => {
    if (closes.length < w + 22) {
      return {
        window: w, current: null, min: null, p25: null, median: null, p75: null, max: null,
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

  let headlineWindow: 10 | 20 | null = null;
  let series: number[] = [];
  if (closes.length >= 22) { series = rollingVol(closes, 20); headlineWindow = 20; }
  else if (closes.length >= 12) { series = rollingVol(closes, 10); headlineWindow = 10; }
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
  if (error) {
    logger.warn(`warm: ${commodity} upsert failed: ${error.message}`);
    return 'error';
  }
  return 'ok';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'warm-vol-cones' });

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('ALERT_EVALUATOR_SECRET');
  const auth = req.headers.get('authorization') ?? '';
  const xCron = req.headers.get('x-cron-secret');
  const authorized =
    (serviceKey && auth === `Bearer ${serviceKey}`) ||
    (cronSecret && xCron === cronSecret);
  if (!authorized) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const summary: Record<string, string> = {};
  for (const [commodity, product] of Object.entries(PRODUCTS)) {
    try {
      summary[commodity] = await refreshOne(commodity, product, admin, logger);
    } catch (e) {
      logger.warn(`warm: ${commodity} unexpected error: ${(e as Error).message}`);
      summary[commodity] = 'error';
    }
  }

  logger.info(`warm-vol-cones complete`, summary);
  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});