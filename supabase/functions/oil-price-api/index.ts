// ============================================================================
// DEPRECATED 2026-07-14 — OilPriceAPI retired. Every commodity in the catalog
// is now sourced from Massive Futures. This function still deploys so older
// clients don't 404, but it short-circuits with an empty payload before any
// upstream call. Do NOT re-enable without a product decision first.
// ============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/utils.ts";

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      deprecated: true,
      reason:
        "OilPriceAPI retired 2026-07-14; use Massive Futures via fetch-commodity-prices instead.",
      data: {},
      commodities: {},
    }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
