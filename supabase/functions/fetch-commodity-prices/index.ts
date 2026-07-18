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

const getBasePriceForCommodity = (commodityName: string): number => {
  const basePrices: Record<string, number> = {
    'WTI Crude Oil': 65, 'Brent Crude Oil': 70, 'Natural Gas': 2.85,
    'Gasoline RBOB': 2.1, 'Heating Oil': 2.3, 'Natural Gas UK': 90,
    'Gold Futures': 2000, 'Silver Futures': 25, 'Platinum': 1050,
    'Palladium': 1200, 'Copper': 4.2, 'Aluminum': 2200,
    // After unit conversion, fallbacks must be in the DISPLAY_UNIT for each symbol.
    // Grains $/bu, Softs/Livestock $/lb, Cocoa $/mt.
    'Corn Futures': 4.30, 'Soybean Futures': 11.50,
    'Wheat Futures': 6.30, 'Wheat Futures Spot': 6.30,
    'Oat Futures': 3.50, 'Oats Spot': 3.50,
    'Soybeans Spot': 11.50,
    'Coffee Arabica': 1.65, 'Sugar #11': 0.20,
    'Cotton': 0.73, 'Cocoa': 7800,
    'Live Cattle Futures': 170, 'Lean Hogs Futures': 75,
    'Feeder Cattle Futures': 245, 'Milk Class III': 18.50,
    'Orange Juice': 4.50, 'Lumber Futures': 550,
    'Soybean Oil': 0.45, 'Soybean Meal': 330, 'Rough Rice': 17,
    'Live Cattle': 1.85, 'Lean Hogs': 0.90, 'Feeder Cattle': 2.45,
    'Rubber': 2.20,
  };
  return basePrices[commodityName] || 100;
};

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
    let dataSource = 'fallback'

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

    // ── Step 3: Synthetic fallback ──
    if (!priceData) {
      console.log(`Fallback for ${commodityName}`)
      const basePrice = getBasePriceForCommodity(commodityName)
      priceData = {
        symbol: PRICE_SYMBOLS[commodityName] || commodityName,
        price: basePrice,
        change: (Math.random() - 0.5) * basePrice * 0.02,
        changePercent: (Math.random() - 0.5) * 4,
        lastUpdate: new Date().toISOString()
      }
    }

    // Apply data delay for free users
    if (dataDelay === '15min' && priceData) {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      const hash = commodityName.split('').reduce((a: number, b: string) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)
      const seededRandom = (Math.abs(hash) % 100) / 100
      priceData = {
        ...priceData,
        price: priceData.price * (0.995 + seededRandom * 0.01),
        change: priceData.change * (0.9 + seededRandom * 0.2),
        changePercent: priceData.changePercent * (0.9 + seededRandom * 0.2),
        lastUpdate: fifteenMinutesAgo.toISOString()
      }
    }

    // Cache real data
    if (dataSource !== 'fallback') {
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
