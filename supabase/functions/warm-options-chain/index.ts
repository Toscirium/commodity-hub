// Cron-driven warmer for the options-chain cache (pro_analytics_cache,
// key `options-chain:${product}:front`).
//
// Why this exists: fetch-options-chain's cold path calls Databento's
// historical API, which generates a full options-universe snapshot per
// request. That's slow and variable — verified live (2026-07-25): a cold
// Gold (GC) load took 139.5s on Databento's side alone, after a narrower
// request window was already needed to avoid this function's own compute
// limit. The 6h cache (shared with fetch-options-chain) means that cost
// only has to be paid once per product per window — this warmer pays it
// proactively on a schedule so real users essentially never hit the cold
// path themselves.
//
// Triggered by pg_cron every 4h with header `X-Cron-Secret: ALERT_EVALUATOR_SECRET`
// (re-using the existing cron secret rather than introducing a new one) —
// same pattern as warm-vol-cones.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveFrontMonth } from '../_shared/massive-client.ts';
import { PRODUCT_ROOTS, buildOptionsChainPayload, NoLiveInstrumentsError } from '../_shared/options-chain-builder.ts';

const CACHE_KEY_PREFIX = 'options-chain:';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'warm-options-chain' });

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

  const apiKey = Deno.env.get('DATABENTO_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'DATABENTO_API_KEY not configured' }), {
      status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const summary: Record<string, string> = {};
  // Sequential, not parallel — this is exactly the kind of heavy Databento
  // load that made Gold's own backend time out; hammering all five products
  // at once would only make that worse.
  for (const product of Object.keys(PRODUCT_ROOTS)) {
    try {
      const payload = await buildOptionsChainPayload(
        apiKey, product, fetchMassiveFrontMonth, undefined,
        (msg, err) => logger.warn(msg, err),
      );
      const { error } = await admin
        .from('pro_analytics_cache')
        .upsert({ key: `${CACHE_KEY_PREFIX}${product}:front`, payload, updated_at: new Date().toISOString() });
      if (error) {
        logger.warn(`warm-options-chain: ${product} upsert failed: ${error.message}`);
        summary[product] = 'error';
      } else {
        summary[product] = 'ok';
      }
    } catch (e) {
      if (e instanceof NoLiveInstrumentsError) {
        logger.warn(`warm-options-chain: ${product} has no live instruments right now`);
        summary[product] = 'no_instruments';
      } else {
        logger.warn(`warm-options-chain: ${product} unexpected error: ${(e as Error).message}`);
        summary[product] = 'error';
      }
    }
  }

  logger.info('warm-options-chain complete', summary);
  return new Response(JSON.stringify({ ok: true, summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
