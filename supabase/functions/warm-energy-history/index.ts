// DEPRECATED 2026-07-14 — OilPriceAPI retired. This warmer is a no-op.
// Cron jobs have been unscheduled; this stub exists only so any stray
// invocation returns cleanly without touching OilPriceAPI.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/utils.ts";

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({ deprecated: true, skipped: true, source: "warm-energy-history" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
