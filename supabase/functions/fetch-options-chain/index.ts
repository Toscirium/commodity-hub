// Fetch CME futures-options data via Databento (GLBX.MDP3 dataset).
//
// Replaces the previous CME public-JSON scraper: that approach violated
// CME's Terms of Use (automated access to their quote-widget endpoints) and
// was fragile (CME rotates that schema periodically). Databento is a
// licensed redistributor of the same underlying CME Globex feed.
//
// The Databento definition/statistics join logic lives in
// _shared/options-chain-builder.ts, shared with warm-options-chain (the
// cron warmer that proactively refreshes this cache — see that function's
// header for why: Databento's own backend can take 60-140s+ to generate a
// cold response for some products, so most requests should hit the cache
// this function's own uncached path helped populate, not re-pay that cost).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders } from '../_shared/utils.ts';
import { IpRateLimiter, tooManyRequestsResponse } from '../_shared/rateLimit.ts';
import { safeLog } from '../_shared/safeConsole.ts';
import { fetchMassiveFrontMonth } from '../_shared/massive-client.ts';
import { PRODUCT_ROOTS, buildOptionsChainPayload, NoLiveInstrumentsError } from '../_shared/options-chain-builder.ts';

const BodySchema = z.object({
  product: z.enum(['CL', 'NG', 'GC', 'ZC', 'ZS']),
  expiration: z.string().max(16).optional(),
});

// Shared with pro-analytics/index.ts's regime/spreads/seasonality caching —
// same {key, payload, updated_at} table. An in-memory Map here was
// unreliable: edge functions run as multiple isolated instances with no
// shared memory, so most requests missed the cache anyway and re-hit
// Databento's slow historical API (this endpoint's main latency source).
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — settlements are daily
const CACHE_KEY_PREFIX = 'options-chain:';
const limiter = new IpRateLimiter({ limit: 30, windowMs: 60_000 });

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

    const cacheKey = `${CACHE_KEY_PREFIX}${product}:${parsed.data.expiration ?? 'front'}`;
    const { data: snap } = await admin
      .from('pro_analytics_cache')
      .select('payload, updated_at')
      .eq('key', cacheKey)
      .maybeSingle();
    const fresh = snap?.updated_at && Date.now() - new Date(snap.updated_at).getTime() < TTL_MS;
    if (fresh && snap?.payload) {
      return new Response(JSON.stringify({ ...(snap.payload as object), cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = await buildOptionsChainPayload(
      apiKey, product, fetchMassiveFrontMonth, parsed.data.expiration,
      (msg, err) => safeLog.warn(msg, err),
    );
    await admin
      .from('pro_analytics_cache')
      .upsert({ key: cacheKey, payload, updated_at: new Date().toISOString() });
    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e instanceof NoLiveInstrumentsError) {
      return new Response(JSON.stringify({
        error: 'Databento returned no live option instruments for this product',
        product: e.product,
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    safeLog.error('Error in fetch-options-chain function:', e);
    return new Response(JSON.stringify({ error: 'Internal error', message: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
