import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CommodityService } from '../_shared/commodity-service.ts';
import { corsHeaders, getOptionalAuthenticatedUser, getUserAuthorizationHeader } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'

// Protect Massive / FMP quotas from anonymous abuse. This is the highest-traffic
// endpoint (loaded on every dashboard visit), so it needs its own limiter.
const limiter = new IpRateLimiter({ limit: 60, windowMs: 60_000 });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ip = IpRateLimiter.getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const validDelays = ['realtime', '15min'];
    const dataDelay = validDelays.includes(body.dataDelay) ? body.dataDelay : 'realtime';

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: getUserAuthorizationHeader(req.headers.get('Authorization'))
            ? { Authorization: getUserAuthorizationHeader(req.headers.get('Authorization'))! }
            : {},
        },
      }
    );

    const user = await getOptionalAuthenticatedUser(supabaseClient, req.headers.get('Authorization'));
    let isPremium = false;
    if (user) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('subscription_active, subscription_tier')
        .eq('id', user.id)
        .single();
      isPremium = !!(profile?.subscription_active && profile?.subscription_tier && profile.subscription_tier !== 'free');
    }

    const service = new CommodityService('fetch-all-commodities');
    let commoditiesData = await service.fetchAllCommodities(isPremium);

    if (dataDelay === '15min') {
      commoditiesData = service.applyDataDelay(commoditiesData, '15min');
    }

    const currentTimestamp =
      dataDelay === '15min'
        ? new Date(Date.now() - 15 * 60 * 1000).toISOString()
        : new Date().toISOString();

    return new Response(
      JSON.stringify({
        commodities: commoditiesData,
        source: 'massive+fmp',
        count: commoditiesData.length,
        timestamp: currentTimestamp,
        dataDelay,
        isDelayed: dataDelay === '15min',
        isPremium,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-all-commodities function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
