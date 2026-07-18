import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/utils.ts'

// Fallback rates (approximate) if API is unavailable
const FALLBACK_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  CNY: 7.25,
  INR: 83.50,
};

// Simple in-memory cache (per edge instance) — refresh every hour
let cache: { rates: Record<string, number>; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let rates: Record<string, number> = { ...FALLBACK_RATES };
    let source = 'fallback';

    // Serve from cache if fresh
    if (cache && Date.now() - cache.ts < CACHE_TTL_MS) {
      rates = cache.rates;
      source = 'frankfurter-cache';
    } else {
      try {
        // Frankfurter: free, no API key, ECB-sourced daily rates.
        // Endpoint returns USD-based rates for the requested symbols.
        const response = await fetch(
          'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,CNY,INR'
        );

        if (response.ok) {
          const data = await response.json();
          if (data && typeof data.rates === 'object') {
            rates = {
              USD: 1,
              EUR: typeof data.rates.EUR === 'number' ? data.rates.EUR : FALLBACK_RATES.EUR,
              CNY: typeof data.rates.CNY === 'number' ? data.rates.CNY : FALLBACK_RATES.CNY,
              INR: typeof data.rates.INR === 'number' ? data.rates.INR : FALLBACK_RATES.INR,
            };
            cache = { rates, ts: Date.now() };
            source = 'frankfurter';
          }
        } else {
          console.warn(`Frankfurter API returned ${response.status}, using fallback`);
        }
      } catch (error) {
        console.warn('Frankfurter API failed, using fallback rates:', error);
      }
    }

    return new Response(
      JSON.stringify({
        rates,
        source,
        baseCurrency: 'USD',
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in currency-rates function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
