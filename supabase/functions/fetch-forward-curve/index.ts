// Forward curve — real EOD settlement strip from Massive Futures Basic (free tier).
// Covers CME/CBOT/COMEX/NYMEX: CL, BZ, NG, GC, SI, HG, ZC, ZS, ZW.
// Per request: 1 contracts call + N daily-agg calls (N = monthsAhead).
// Cached 6h in-worker to stay way under Massive's 5 req/min cap.
// Pro-tier gated. JWT-verified.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveCurve } from '../_shared/massive-client.ts';

// commodity id → { label, Massive product_code }
const PRODUCTS: Record<string, { label: string; code: string }> = {
  wti:      { label: 'WTI Crude',   code: 'CL' },
  brent:    { label: 'Brent Crude', code: 'BZ' },
  natgas:   { label: 'Natural Gas', code: 'NG' },
  gold:     { label: 'Gold',        code: 'GC' },
  silver:   { label: 'Silver',      code: 'SI' },
  copper:   { label: 'Copper',      code: 'HG' },
  corn:     { label: 'Corn',        code: 'ZC' },
  soybeans: { label: 'Soybeans',    code: 'ZS' },
  wheat:    { label: 'Wheat',       code: 'ZW' },
};

const BodySchema = z.object({
  commodity: z.enum(['wti','brent','natgas','gold','silver','copper','corn','soybeans','wheat']),
  monthsAhead: z.number().int().min(3).max(24).default(12),
});

// In-worker response cache (per cold-start). TTL 6h.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; payload: unknown }>();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'fetch-forward-curve' });

  try {
    // JWT auth
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

    // Pro-tier gate
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
    const product = PRODUCTS[commodity];

    const cacheKey = `${commodity}:${monthsAhead}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return new Response(JSON.stringify(hit.payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600', 'X-Cache': 'HIT' },
      });
    }

    const { asOf, curve } = await fetchMassiveCurve(product.code, monthsAhead);
    if (curve.length < 3) {
      logger.warn(`Massive returned ${curve.length} contracts for ${commodity} (${product.code})`);
      return new Response(JSON.stringify({ error: 'curve_unavailable' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const m1 = curve[0]?.price ?? null;
    const m2 = curve[1]?.price ?? null;
    const structure: 'contango' | 'backwardation' | 'flat' | 'unknown' =
      m1 == null || m2 == null ? 'unknown'
        : m2 > m1 * 1.001 ? 'contango'
        : m2 < m1 * 0.999 ? 'backwardation'
        : 'flat';
    const rollYield = m1 && m2 ? ((m2 - m1) / m1) * 100 : null;

    const payload = {
      commodity,
      label: product.label,
      source: 'market' as const,
      provider: 'Massive Futures Starter',
      asOf,
      spot: m1,           // M1 settlement is the closest proxy to spot on EOD data
      curve,
      m1,
      m2,
      structure,
      rollYield,
    };
    cache.set(cacheKey, { at: Date.now(), payload });

    logger.info(`Curve for ${commodity} (${product.code}) asOf=${asOf}: ${curve.length} pts, m1=${m1}, m2=${m2}, ${structure}`);
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=21600', 'X-Cache': 'MISS' },
    });
  } catch (err) {
    logger.error('fetch-forward-curve failed', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
