// Roll Yield / Calendar Spread Scanner — Pro tier.
// Ranks all Massive-covered futures by M1→M2 roll yield (contango vs backwardation).
// One curve call per product, run in parallel. Cached 6h in-worker.

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

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; payload: unknown } | null = null;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'massive-roll-scanner' });

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

    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cache.payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    let results: any[] = [];
    let liveFailed = false;
    try {
      results = await Promise.all(
        PRODUCTS.map(async (p) => {
        try {
          const { asOf, curve } = await fetchMassiveCurve(p.code, 12);
          if (curve.length < 2) return { ...p, error: 'no_data' as const };
          const m1 = curve[0].price;
          const m2 = curve[1].price;
          const mLast = curve[curve.length - 1].price;
          const rollM1M2 = ((m2 - m1) / m1) * 100;
          const annualizedRoll = rollM1M2 * 12;
          const fullSlope = ((mLast - m1) / m1) * 100;
          const structure: 'contango' | 'backwardation' | 'flat' =
            rollM1M2 > 0.1 ? 'contango' : rollM1M2 < -0.1 ? 'backwardation' : 'flat';
          return {
            ...p, asOf, m1, m2, mLast, contracts: curve.length,
            rollM1M2: +rollM1M2.toFixed(3),
            annualizedRoll: +annualizedRoll.toFixed(2),
            fullSlope: +fullSlope.toFixed(3),
            structure,
            frontExpiry: curve[0].expiry,
            lastExpiry: curve[curve.length - 1].expiry,
          };
        } catch (e) {
          logger.warn(`scan ${p.code} failed: ${(e as Error).message}`);
          return { ...p, error: 'fetch_failed' as const };
        }
        }),
      );
    } catch (e) {
      logger.warn(`roll-scanner live fetch threw: ${(e as Error).message}`);
      liveFailed = true;
    }

    const successCount = results.filter((r: any) => !r.error).length;
    if (liveFailed || successCount < 3) {
      const { data: snap } = await admin
        .from('analytics_snapshots')
        .select('payload, as_of')
        .eq('kind', 'roll_scanner')
        .eq('key', 'all')
        .maybeSingle();
      if (snap?.payload) {
        const stalePayload = { ...(snap.payload as Record<string, unknown>), stale: true, asOf: snap.as_of };
        return new Response(JSON.stringify(stalePayload), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
        });
      }
      return new Response(JSON.stringify({ error: 'fetch_failed' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      provider: 'Massive Futures Starter',
      results,
      stale: false,
    };
    cache = { at: Date.now(), payload };
    // Persist last-good snapshot (best-effort)
    admin.from('analytics_snapshots').upsert({
      kind: 'roll_scanner',
      key: 'all',
      payload,
      as_of: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) logger.warn(`snapshot upsert failed: ${error.message}`);
    });
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    logger.error('roll-scanner failed', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});