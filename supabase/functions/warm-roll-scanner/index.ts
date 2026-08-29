// Cron-driven warmer for the Roll Scanner analytics_snapshots row.
//
// massive-roll-scanner (the interactive, JWT-authed function the in-app
// page calls) only refreshes analytics_snapshots as a side effect of a real
// Pro user loading that page with a stale in-worker cache. That's fine for
// the app, but the same cache is now also read directly by data-api's
// resource=roll_scanner — and the Data API is explicitly marketed at
// developers who may never open the app at all. Without traffic driving a
// refresh, the snapshot can go stale indefinitely (or never exist for a
// brand-new deploy), which is a real reliability gap for an API customer,
// not just a cosmetic one.
//
// Deliberately sequential — one call to Massive, not a Promise.all fan-out
// like massive-roll-scanner's interactive path uses — a background cron has
// no user waiting on it and no reason to burst the provider, unlike the
// interactive path where a real person is looking at a spinner.
//
// Triggered by pg_cron every 4h with header `X-Cron-Secret: <ALERT_EVALUATOR_SECRET>`
// (re-using the existing cron secret, same choice warm-vol-cones already made).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveCurve } from '../_shared/massive-client.ts';

const PRODUCTS: { id: string; label: string; code: string; category: string }[] = [
  { id: 'wti',      label: 'WTI Crude',    code: 'CL',  category: 'energy' },
  { id: 'brent',    label: 'Brent Crude',  code: 'BZ',  category: 'energy' },
  { id: 'gold',     label: 'Gold',         code: 'GC',  category: 'metals' },
  { id: 'silver',   label: 'Silver',       code: 'SI',  category: 'metals' },
  { id: 'copper',   label: 'Copper',       code: 'HG',  category: 'metals' },
  { id: 'platinum', label: 'Platinum',     code: 'PL',  category: 'metals' },
  { id: 'palladium',label: 'Palladium',    code: 'PA',  category: 'metals' },
  { id: 'corn',     label: 'Corn',         code: 'ZC',  category: 'grains' },
  { id: 'wheat',    label: 'Wheat',        code: 'ZW',  category: 'grains' },
  { id: 'soybeans', label: 'Soybeans',     code: 'ZS',  category: 'grains' },
  { id: 'soyoil',   label: 'Soybean Oil',  code: 'ZL',  category: 'grains' },
  { id: 'soymeal',  label: 'Soybean Meal', code: 'ZM',  category: 'grains' },
  { id: 'oats',     label: 'Oats',         code: 'ZO',  category: 'grains' },
  { id: 'cattle',   label: 'Live Cattle',  code: 'LE',  category: 'livestock' },
  { id: 'hogs',     label: 'Lean Hogs',    code: 'HE',  category: 'livestock' },
  { id: 'lumber',   label: 'Lumber',       code: 'LBR', category: 'industrials' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'warm-roll-scanner' });

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

  const results: unknown[] = [];
  let successCount = 0;
  for (const p of PRODUCTS) {
    try {
      const { asOf, curve } = await fetchMassiveCurve(p.code, 12);
      if (curve.length < 2) {
        logger.warn(`warm-roll-scanner: ${p.code} returned ${curve.length} points, skipping`);
        results.push({ ...p, error: 'no_data' as const });
        continue;
      }
      const m1 = curve[0].price;
      const m2 = curve[1].price;
      const mLast = curve[curve.length - 1].price;
      const rollM1M2 = ((m2 - m1) / m1) * 100;
      const annualizedRoll = rollM1M2 * 12;
      const fullSlope = ((mLast - m1) / m1) * 100;
      const structure: 'contango' | 'backwardation' | 'flat' =
        rollM1M2 > 0.1 ? 'contango' : rollM1M2 < -0.1 ? 'backwardation' : 'flat';
      results.push({
        ...p, asOf, m1, m2, mLast, contracts: curve.length,
        rollM1M2: +rollM1M2.toFixed(3),
        annualizedRoll: +annualizedRoll.toFixed(2),
        fullSlope: +fullSlope.toFixed(3),
        structure,
        frontExpiry: curve[0].expiry,
        lastExpiry: curve[curve.length - 1].expiry,
      });
      successCount++;
    } catch (e) {
      logger.warn(`warm-roll-scanner: ${p.code} failed: ${(e as Error).message}`);
      results.push({ ...p, error: 'fetch_failed' as const });
    }
  }

  // Same threshold massive-roll-scanner's own live path uses before it will
  // trust a partial scan — a couple of provider hiccups shouldn't overwrite
  // a good cache with a mostly-empty one.
  if (successCount < 3) {
    logger.warn(`warm-roll-scanner: only ${successCount}/${PRODUCTS.length} succeeded, not overwriting the cache`);
    return new Response(JSON.stringify({ ok: false, successCount, total: PRODUCTS.length }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    provider: 'Massive Futures Starter',
    results,
    stale: false,
  };
  const { error } = await admin.from('analytics_snapshots').upsert({
    kind: 'roll_scanner',
    key: 'all',
    payload,
    as_of: new Date().toISOString(),
  });
  if (error) logger.warn(`warm-roll-scanner: snapshot upsert failed: ${error.message}`);

  logger.info('warm-roll-scanner complete', { successCount, total: PRODUCTS.length });
  return new Response(JSON.stringify({ ok: true, successCount, total: PRODUCTS.length }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
