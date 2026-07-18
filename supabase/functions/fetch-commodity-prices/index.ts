import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'
import { FMP_SYMBOLS, MASSIVE_PRODUCT_CODES } from '../_shared/commodity-mappings.ts'
import { fetchFmpQuote } from '../_shared/fmp-client.ts'
import { fetchMassiveFrontMonth } from '../_shared/massive-client.ts'

// Protect Massive / FMP quotas from anonymous abuse.
const limiter = new IpRateLimiter({ limit: 60, windowMs: 60_000 });

// In-memory cache with TTL
const priceCache = new Map<string, { data: any; source: string; timestamp: number }>();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

function getCachedPrice(key: string): { data: any; source: string } | null {
  const entry = priceCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return { data: entry.data, source: entry.source };
  }
  if (entry) priceCache.delete(key);
  return null;
}

function setCachedPrice(key: string, data: any, source: string): void {
  if (priceCache.size > 200) {
    const oldest = priceCache.keys().next().value;
    if (oldest) priceCache.delete(oldest);
  }
  priceCache.set(key, { data, source, timestamp: Date.now() });
}

// Single source of truth: FMP `=F` symbols derived from the catalog.
const PRICE_SYMBOLS: Record<string, string> = FMP_SYMBOLS;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
    const body = await req.json()
    
    const commodityName = typeof body.commodityName === 'string' && body.commodityName.length > 0 && body.commodityName.length <= 100
      ? body.commodityName : null;
    const isPremium = typeof body.isPremium === 'boolean' ? body.isPremium : false;
    const validDelays = ['realtime', '15min'];
    const dataDelay = validDelays.includes(body.dataDelay) ? body.dataDelay : 'realtime';
    
    if (!commodityName) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid commodityName' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching price for ${commodityName} (delay: ${dataDelay})`)

    // Check cache
    const cacheKey = `price:${commodityName}:${dataDelay}`;
    const cached = getCachedPrice(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${commodityName}`);
      return new Response(
        JSON.stringify({
          price: cached.data, source: cached.source,
          commodity: commodityName, symbol: cached.data?.symbol,
          realTime: isPremium, dataDelay, isDelayed: dataDelay === '15min', cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let priceData = null
    let dataSource = 'unavailable'

    // ── Step 1: Massive Futures for every commodity in the catalog ──
    if (!priceData) {
      const massiveCode = MASSIVE_PRODUCT_CODES[commodityName];
      if (massiveCode) {
        try {
          const fm = await fetchMassiveFrontMonth(massiveCode);
          if (fm) {
            priceData = {
              symbol: fm.ticker,
              price: fm.price,
              change: fm.change,
              changePercent: fm.changePercent,
              lastUpdate: fm.asOf,
            };
            dataSource = 'massive';
          }
        } catch (err) {
          console.warn(`Massive snapshot failed for ${commodityName}:`, err);
        }
      }
    }

    // ── Step 2: FMP fallback (kept for legacy ICE/LME items still in FMP_SYMBOLS) ──
    if (!priceData) {
      const fmpSym = PRICE_SYMBOLS[commodityName];
      if (fmpSym) {
        try {
          const q = await fetchFmpQuote(fmpSym);
          if (q && typeof q.price === 'number' && q.price > 0) {
            priceData = {
              symbol: fmpSym,
              price: Math.round(q.price * 10000) / 10000,
              change: typeof q.change === 'number' ? q.change : 0,
              changePercent: typeof q.changesPercentage === 'number' ? q.changesPercentage : 0,
              lastUpdate: new Date().toISOString(),
            };
            dataSource = 'fmp';
          }
        } catch (err) {
          console.warn(`FMP quote failed for ${commodityName}:`, err);
        }
      }
    }

    // ── Step 3: Explicit unavailable state ──
    if (!priceData) {
      return new Response(
        JSON.stringify({ price: null, source: 'unavailable', commodity: commodityName, error: 'Verified price unavailable' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Delayed access changes freshness metadata only; values remain verified.

    // Cache real data
    if (dataSource !== 'unavailable') {
      setCachedPrice(cacheKey, priceData, dataSource);
    }

    return new Response(
      JSON.stringify({
        price: priceData, source: dataSource,
        commodity: commodityName, symbol: priceData?.symbol,
        realTime: isPremium, dataDelay, isDelayed: dataDelay === '15min'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in fetch-commodity-prices:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
