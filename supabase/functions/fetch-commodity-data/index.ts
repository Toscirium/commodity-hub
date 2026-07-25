import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'
import { FMP_SYMBOLS, MASSIVE_PRODUCT_CODES } from '../_shared/commodity-mappings.ts'
import { fetchFmpHistorical } from '../_shared/fmp-client.ts'
import { fetchMassiveFrontMonthBars } from '../_shared/massive-client.ts'

// Protect Yahoo/CommodityPriceAPI/OilPriceAPI quota from anonymous abuse.
const limiter = new IpRateLimiter({ limit: 60, windowMs: 60_000 });

// In-memory cache with TTL for historical data
const historyCache = new Map<string, { data: any; source: string; timestamp: number }>();
const HISTORY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (historical data changes less frequently)
const HISTORICAL_TIMEFRAMES = new Set(['1d', '1m', '3m', '6m', '1y', '2y', '5y']);

// Massive's plan currently backs up to 2 years of daily aggs, and that's the
// practical ceiling for every provider here — asking for more (as '5y' used
// to, requesting 1825 days) doesn't get you more bars, just a chart quietly
// truncated to whatever history is actually available.
const TWO_YEAR_DAYS = 730;

function getHistoryDays(timeframe: string, intradayDays: number, oneMonthDays: number, threeMonthDays: number, sixMonthDays: number, oneYearDays: number): number {
  switch (timeframe) {
    case '1d': return intradayDays;
    case '1m': return oneMonthDays;
    case '3m': return threeMonthDays;
    case '6m': return sixMonthDays;
    case '1y': return oneYearDays;
    case '2y': return TWO_YEAR_DAYS;
    case '5y': return TWO_YEAR_DAYS;
    default: return oneYearDays;
  }
}

function getCachedHistory(key: string): { data: any; source: string } | null {
  const entry = historyCache.get(key);
  if (entry && Date.now() - entry.timestamp < HISTORY_CACHE_TTL) {
    return { data: entry.data, source: entry.source };
  }
  if (entry) historyCache.delete(key);
  return null;
}

function setCachedHistory(key: string, data: any, source: string): void {
  if (historyCache.size > 300) {
    const oldest = historyCache.keys().next().value;
    if (oldest) historyCache.delete(oldest);
  }
  historyCache.set(key, { data, source, timestamp: Date.now() });
}

// Symbol aliases used only to populate the response's `symbol` field for the
// chart footer. Historical data itself comes from Massive Futures.
const COMMODITY_SYMBOLS: Record<string, string> = {
  // Energy (Massive Futures)
  'WTI Crude Oil': 'CL=F',
  'Brent Crude Oil': 'BZ=F',
  'Natural Gas': 'NG=F',
  'Gasoline RBOB': 'RB=F',
  'Heating Oil': 'HO=F',
  
  // Metals
  'Gold Futures': 'GC=F',
  'Silver Futures': 'SI=F',
  'Platinum': 'PL=F',
  'Palladium': 'PA=F',
  'Copper': 'HG=F',
  'Aluminum': 'HG=F',
  'Zinc': 'HG=F',
  
  // Grains
  'Corn Futures': 'ZC=F',
  'Soybean Futures': 'ZS=F',
  'Soybean Oil': 'ZL=F',
  'Soybean Meal': 'ZM=F',
  'Oat Futures': 'ZO=F',
  'Rough Rice': 'ZR=F',
  
  // Livestock
  'Live Cattle Futures': 'LE=F',
  'Feeder Cattle Futures': 'GF=F',
  'Lean Hogs Futures': 'HE=F',
  'Milk Class III': 'HE=F',
  
  // Softs
  'Coffee Arabica': 'KC=F',
  'Sugar #11': 'SB=F',
  'Cotton': 'CT=F',
  'Cocoa': 'CC=F',
  'Orange Juice': 'OJ=F',
  
  // Other
  'Lumber Futures': 'LBS=F',
  'Random Length Lumber': 'LBS=F',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // IP rate limit — protects external paid APIs (OilPriceAPI, Yahoo, etc.) from quota burn.
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

  let commodityName = 'WTI Crude Oil';
  try {
    const body = await req.json();
    commodityName = body.commodityName;
    const { timeframe, isPremium, chartType, dataDelay = 'realtime', contractSymbol } = body;
    
    if (!commodityName || !timeframe) {
      return new Response(
        JSON.stringify({ error: 'Missing commodityName or timeframe' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!HISTORICAL_TIMEFRAMES.has(timeframe)) {
      return new Response(
        JSON.stringify({ error: 'Unsupported timeframe', supportedTimeframes: [...HISTORICAL_TIMEFRAMES] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Fetching data for ${commodityName}, timeframe: ${timeframe}, chartType: ${chartType || 'line'}`)

    // Check cache first
    // The requested contract affects the response symbol even when its history
    // falls back to the verified front-month series, so it must be cache-isolated.
    const cacheKey = `history:${commodityName}:${contractSymbol || ''}:${timeframe}:${chartType || 'line'}:${dataDelay}`;
    const cached = getCachedHistory(cacheKey);
    if (cached) {
      console.log(`Cache hit for ${commodityName} ${timeframe}`);
      const cachedOhlc = cached.source.endsWith('|ohlc') && timeframe !== '1d';
      const cachedSource = cached.source.replace('|ohlc', '');
      return new Response(
        JSON.stringify({
          data: cached.data,
          source: cachedSource,
          ohlcAvailable: cachedOhlc,
          commodity: commodityName,
          symbol: COMMODITY_SYMBOLS[commodityName] || commodityName,
          realTime: isPremium || false,
          dataPoints: cached.data?.length || 0,
          chartType: chartType || 'line',
          dataDelay,
          isDelayed: dataDelay === '15min',
          cached: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let symbol = contractSymbol || COMMODITY_SYMBOLS[commodityName]
    let isIBKRContract = false

    if (contractSymbol) {
      const baseSymbol = COMMODITY_SYMBOLS[commodityName]
      if (baseSymbol && contractSymbol !== baseSymbol) {
        symbol = baseSymbol
        isIBKRContract = true
      }
    }

    if (!symbol) {
      throw new Error(`Commodity ${commodityName} not found`)
    }

    let historicalData = null
    let dataSourceUsed = 'unavailable';
    let ohlcAvailable = false;

    // Step 1: Massive daily aggs — sole source for every commodity in the catalog.
    const massiveCode = MASSIVE_PRODUCT_CODES[commodityName];
    if (!historicalData && massiveCode) {
      try {
        const maxDays = isPremium
          ? getHistoryDays(timeframe, 5, 60, 180, 365, 730)
          : getHistoryDays(timeframe, 5, 30, 90, 180, 365);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - maxDays);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const bars = await fetchMassiveFrontMonthBars(massiveCode, startStr, endStr);
        if (bars.length > 1) {
          historicalData = bars.map((b) => ({
            date: b.date,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            price: b.close,
          }));
          ohlcAvailable = true;
          dataSourceUsed = 'massive';
          console.log(`Massive historical: ${bars.length} bars for ${commodityName} (${massiveCode})`);
        }
      } catch (err) {
        console.warn(`Massive historical failed for ${commodityName}:`, err);
      }
    }

    // Step 2b: FMP /v3/historical-price-full for ICE/LME items.
    const fmpSym = FMP_SYMBOLS[commodityName];

    if (!historicalData && fmpSym) {
      try {
        const maxDays = isPremium
          ? getHistoryDays(timeframe, 2, 60, 180, 365, 730)
          : getHistoryDays(timeframe, 2, 30, 90, 180, 365);

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - maxDays);
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];

        const bars = await fetchFmpHistorical(fmpSym, startStr, endStr);
        if (bars.length > 1) {
          historicalData = bars.map((b) => ({
            date: b.date,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            price: b.close,
          }));
          ohlcAvailable = true;
          dataSourceUsed = 'fmp';
          console.log(`FMP historical: ${bars.length} bars for ${commodityName} (${fmpSym})`);
        }
      } catch (error) {
        console.warn(`FMP historical failed for ${commodityName}:`, error);
        historicalData = null;
      }
    }

    // Step 2b: (legacy fallback layer removed — FMP is now the sole non-energy source)

    // A chart without a provider response is unavailable; never synthesize a
    // plausible time series or contract adjustment.
    if (!historicalData) {
      return new Response(
        JSON.stringify({ error: 'Verified historical data is unavailable', data: [], source: 'unavailable', ohlcAvailable: false }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Intraday: no provider gives true OHLC bars — never advertise candlesticks.
    if (timeframe === '1d') ohlcAvailable = false;

    // Contract-specific synthetic adjustments were intentionally removed. A
    // front-month series is returned until a provider supplies that contract.
    if (isIBKRContract && contractSymbol && historicalData) {
      console.warn(`Using verified front-month history for unsupported contract ${contractSymbol}`);
    }

    // Apply data delay for free users
    // Delayed access changes freshness only; it never mutates verified bars.

    // Cache the result if from a real API source
    if (dataSourceUsed !== 'unavailable' && historicalData) {
      setCachedHistory(cacheKey, historicalData, dataSourceUsed + (ohlcAvailable ? '|ohlc' : ''));
    }

    return new Response(
      JSON.stringify({ 
        data: historicalData,
        source: dataSourceUsed,
        ohlcAvailable,
        commodity: commodityName,
        symbol: symbol,
        realTime: isPremium || false,
        dataPoints: historicalData?.length || 0,
        chartType: chartType || 'line',
        dataDelay: dataDelay,
        isDelayed: dataDelay === '15min'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in fetch-commodity-data function:', error)
    return new Response(
      JSON.stringify({ data: [], source: 'unavailable', ohlcAvailable: false, error: 'Historical data unavailable' }),
      { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
