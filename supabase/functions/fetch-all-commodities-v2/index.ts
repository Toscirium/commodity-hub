import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, EdgeLogger, getOptionalAuthenticatedUser, getUserAuthorizationHeader } from '../_shared/utils.ts';
import { CommodityService } from '../_shared/commodity-service.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const logger = new EdgeLogger({ functionName: 'fetch-all-commodities-v2' });
  const commodityService = new CommodityService('fetch-all-commodities-v2');

  try {
    const body = req.method === 'POST' ? await req.json() : {};
    const { dataDelay = 'realtime' } = body;
    
    logger.info(`Fetching all commodities with ${dataDelay} data`);

    // Initialize Supabase client
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

    // Check if user is authenticated and premium. Ignore anon/service tokens so
    // public commodity loads don't create noisy /auth/v1/user bad_jwt errors.
    const user = await getOptionalAuthenticatedUser(supabaseClient, req.headers.get('Authorization'));
    
    let isPremium = false;
    
    if (user) {
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('subscription_active, subscription_tier')
        .eq('id', user.id)
        .single();
      
      isPremium = profile?.subscription_active && profile?.subscription_tier === 'premium';
    }

    // Fetch commodities data
    let commoditiesData = await commodityService.fetchAllCommodities();
    
    // Apply data delay for free users
    if (dataDelay === '15min') {
      commoditiesData = commodityService.applyDataDelay(commoditiesData, '15min');
    }

    const currentTimestamp = dataDelay === '15min' 
      ? new Date(Date.now() - 15 * 60 * 1000).toISOString()
      : new Date().toISOString();

    const response = {
      commodities: commoditiesData,
      count: commoditiesData.length,
      timestamp: currentTimestamp,
      dataDelay: dataDelay,
      isDelayed: dataDelay === '15min',
      isPremium,
      performanceMetrics: commodityService.getPerformanceMetrics()
    };

    logger.info(`Successfully returned ${commoditiesData.length} commodities`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Error in fetch-all-commodities-v2 function', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch commodities data',
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});