import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { PREMIUM_COMMODITIES } from '../_shared/commodity-mappings.ts'
import { CommodityService } from '../_shared/commodity-service.ts'
import { corsHeaders, getOptionalAuthenticatedUser, getUserAuthorizationHeader } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
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
    )

    const user = await getOptionalAuthenticatedUser(supabaseClient, req.headers.get('Authorization'))
    let isPremium = false;
    if (user) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('subscription_active, subscription_tier')
        .eq('id', user.id)
        .single()
      isPremium = !!(profile?.subscription_active && profile?.subscription_tier && profile.subscription_tier !== 'free');
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const dataDelay = body.dataDelay === '15min' ? '15min' : 'realtime'

    // Delegate to the shared CommodityService — it owns the canonical 1h in-memory
    // cache for both CPA (non-energy) and the OilPriceAPI proxy (energy). This
    // ensures fetch-commodity-symbols and fetch-all-commodities never disagree
    // on prices and don't double-spend OilPriceAPI quota.
    const service = new CommodityService('fetch-commodity-symbols');
    let commoditiesData = await service.fetchAllCommodities(isPremium);

    if (dataDelay === '15min') {
      commoditiesData = service.applyDataDelay(commoditiesData, '15min');
    }

    // Defence-in-depth: filter premium for free callers even if upstream slips.
    const filteredData = isPremium
      ? commoditiesData
      : commoditiesData.filter((c) => !PREMIUM_COMMODITIES.has(c.name));

    const enriched = filteredData.map((c) => ({
      ...c,
      volume: c.volume ?? 0,
      supportedByFMP: false,
      source: c.price > 0 ? 'live' : 'static',
    }));

    const currentTimestamp = dataDelay === '15min'
      ? new Date(Date.now() - 15 * 60 * 1000).toISOString()
      : new Date().toISOString();

    return new Response(
      JSON.stringify({
        commodities: enriched,
        source: 'commodity-service',
        count: enriched.length,
        timestamp: currentTimestamp,
        dataDelay,
        isDelayed: dataDelay === '15min',
        isPremium,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in fetch-commodity-symbols function:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch commodity symbols' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
