// Deprecated: WebSocket realtime stream disabled.
// Reason: CommodityPriceAPI Lite plan limits us to 10 req/min and 2,000 calls/month.
// Polling every 5s would burn the monthly quota in under 7 minutes per active user.
// Frontend should now poll the cached `fetch-all-commodities` endpoint (1-hour cache)
// for updates. See mem://integrations/commoditypriceapi-config.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/utils.ts'

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: 'Realtime WebSocket stream has been deprecated.',
      reason:
        'Live price polling is no longer supported on the current CommodityPriceAPI tier. ' +
        'Use the cached /fetch-all-commodities endpoint, which refreshes hourly.',
    }),
    {
      status: 410, // Gone
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
