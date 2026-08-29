// Cron-driven warmer for the Term Structure analytics_snapshots rows.
// Iterates every supported product sequentially so we don't hammer Massive,
// catches per-product failures, and refreshes each product's snapshot row.
// Same shape as warm-vol-cones — see that file's header comment for why a
// dedicated warmer exists instead of pg_cron hitting the interactive
// (per-product, JWT-authed) massive-term-structure function directly: one
// cron job needs to fan out across 13 products, and pg_cron's net.http_post
// can't easily do that from a single job definition.
//
// Only warms months_ahead=12 — confirmed to be the only value the in-app
// hook (useMassiveAnalytics.ts) and data-api's resource=term_structure
// default both ever actually request. A caller who explicitly asks for a
// different months_ahead still gets a correct answer from
// massive-term-structure's own on-demand compute-and-cache path; it's just
// not pre-warmed by this job.
//
// Triggered by pg_cron every 4h with header `X-Cron-Secret: <ALERT_EVALUATOR_SECRET>`
// (re-using the existing cron secret, same choice warm-vol-cones already made).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
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

const MONTHS_AHEAD = 12;

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function refreshOne(
  commodity: string,
  product: { label: string; code: string },
  admin: ReturnType<typeof createClient<any>>,
  logger: EdgeLogger,
): Promise<'ok' | 'thin' | 'error'> {
  let curveResult: { asOf: string; curve: { symbol: string; expiry: string; monthIdx: number; price: number }[] };
  try {
    curveResult = await fetchMassiveCurve(product.code, MONTHS_AHEAD);
  } catch (e) {
    logger.warn(`warm: ${product.code} curve fetch threw: ${(e as Error).message}`);
    return 'error';
  }
  const { asOf, curve } = curveResult;
  if (curve.length < 3) {
    logger.warn(`warm: ${product.code} only ${curve.length} points, skipping`);
    return 'thin';
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
    monthsAhead: MONTHS_AHEAD,
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
    key: `${commodity}:${MONTHS_AHEAD}`,
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
  const logger = new EdgeLogger({ functionName: 'warm-term-structure' });

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

  logger.info('warm-term-structure complete', summary);
  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
