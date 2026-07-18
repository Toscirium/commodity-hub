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

// NOTE: We never synthesize OHLC — fallback / mock data is always close-only.
// Real candlesticks require true open/high/low/close from a provider, which is
// only available from CommodityPriceAPI's daily timeseries for some symbols.
const generateFallbackData = (commodityName: string, timeframe: string, basePrice: number, isPremium: boolean = false, _chartType: string = 'line') => {
  const dataPoints = isPremium 
    ? (timeframe === '1d' ? 48 : timeframe === '1m' ? 60 : timeframe === '3m' ? 180 : timeframe === '6m' ? 365 : 730)
    : (timeframe === '1d' ? 24 : timeframe === '1m' ? 30 : timeframe === '3m' ? 90 : timeframe === '6m' ? 180 : 365);
  const data: any[] = [];
  const now = new Date();
  
  let currentPrice = basePrice;
  
  const isEnergy = commodityName.includes('Oil') || commodityName.includes('Gas') || 
    commodityName.includes('Fuel') || commodityName.includes('Diesel') || 
    commodityName.includes('VLSFO') || commodityName.includes('HFO') || commodityName.includes('MGO');
  const isAgri = commodityName.includes('Futures') || commodityName.includes('Corn') || commodityName.includes('Soybean');
  
  let volatility: number;
  if (isEnergy) {
    volatility = basePrice * (timeframe === '1d' ? 0.03 : timeframe === '1m' ? 0.05 : timeframe === '3m' ? 0.08 : 0.15);
  } else if (isAgri) {
    volatility = basePrice * (timeframe === '1d' ? 0.02 : timeframe === '1m' ? 0.04 : timeframe === '3m' ? 0.07 : 0.12);
  } else {
    volatility = basePrice * (timeframe === '1d' ? 0.015 : timeframe === '1m' ? 0.03 : timeframe === '3m' ? 0.05 : 0.1);
  }
  
  const trendDirection = Math.random() > 0.5 ? 1 : -1;
  const trendStrength = 0.0007;
  
  for (let i = dataPoints - 1; i >= 0; i--) {
    let date: Date;
    if (timeframe === '1d') {
      date = new Date(now.getTime() - (i * 60 * 60 * 1000));
    } else {
      date = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
    }
    
    const randomChange = (Math.random() - 0.5) * volatility * 2;
    const trendComponent = trendDirection * trendStrength * basePrice * (dataPoints - i);
    const meanReversionComponent = (basePrice - currentPrice) * 0.01;
    
    // Add cyclical patterns for longer timeframes
    let cycleFactor = 0;
    if (timeframe === '3m' || timeframe === '6m' || timeframe === '1y') {
      cycleFactor = Math.sin((i / dataPoints) * Math.PI * 4) * 0.02 * basePrice;
    }
    
    currentPrice += randomChange + trendComponent + meanReversionComponent + cycleFactor;
    currentPrice = Math.max(basePrice * 0.7, Math.min(basePrice * 1.3, currentPrice));
    
    let decimals = 2;
    if (basePrice >= 1000) decimals = 0;
    else if (basePrice >= 100) decimals = 1;

    data.push({
      date: date.toISOString(),
      price: Math.round(currentPrice * Math.pow(10, decimals)) / Math.pow(10, decimals),
    });
  }
  
  return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const getBasePriceForCommodity = (commodityName: string): number => {
  const basePrices: Record<string, number> = {
    'WTI Crude Oil': 65, 'Brent Crude Oil': 70, 'Natural Gas': 2.85,
    'Gasoline RBOB': 2.1, 'Heating Oil': 2.3, 'Natural Gas UK': 90,
    'Crude Oil Dubai': 64, 'Tapis Crude Oil': 68, 'Urals Crude Oil': 62,
    'Western Canadian Select': 55, 'Jet Fuel': 2.5, 'ULSD Diesel': 2.4,
    'Dutch TTF Gas': 28, 'Japan/Korea LNG': 15.50, 'US Gas Storage': 2.85,
    'VLSFO Global': 550, 'HFO 380 Global': 400, 'MGO 0.5%S Global': 700,
    'HFO 380 Rotterdam': 410, 'VLSFO Singapore': 560, 'MGO Houston': 720,
    'VLSFO Fujairah': 570,
    'Gold Futures': 2000, 'Silver Futures': 25, 'Platinum': 1050,
    'Palladium': 1200, 'Copper': 4.2, 'Aluminum': 2200, 'Zinc': 2800,
    'Corn Futures': 430, 'Soybean Futures': 1150,
    'Soybean Oil': 45, 'Soybean Meal': 315, 'Oat Futures': 385, 'Rough Rice': 16.25,
    'Live Cattle Futures': 170, 'Feeder Cattle Futures': 240,
    'Lean Hogs Futures': 75, 'Milk Class III': 20.85,
    'Coffee Arabica': 165, 'Sugar #11': 19.75, 'Cotton': 72.80,
    'Cocoa': 2850, 'Orange Juice': 315,
    'Lumber Futures': 485, 'Random Length Lumber': 485,
  };
  return basePrices[commodityName] || 100;
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

    console.log(`Fetching data for ${commodityName}, timeframe: ${timeframe}, chartType: ${chartType || 'line'}`)

    // Check cache first
    const cacheKey = `history:${commodityName}:${timeframe}:${chartType || 'line'}:${dataDelay}`;
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
    let dataSourceUsed = 'fallback';
    let ohlcAvailable = false;

    // Step 1: Massive daily aggs — sole source for every commodity in the catalog.
    const massiveCode = MASSIVE_PRODUCT_CODES[commodityName];
    if (!historicalData && massiveCode) {
      try {
        const maxDays = isPremium
          ? (timeframe === '1d' ? 5 : timeframe === '1m' ? 60 : timeframe === '3m' ? 180 : timeframe === '6m' ? 365 : 730)
          : (timeframe === '1d' ? 5 : timeframe === '1m' ? 30 : timeframe === '3m' ? 90 : timeframe === '6m' ? 180 : 365);
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
          ? (timeframe === '1d' ? 2 : timeframe === '1m' ? 60 : timeframe === '3m' ? 180 : timeframe === '6m' ? 365 : 730)
          : (timeframe === '1d' ? 2 : timeframe === '1m' ? 30 : timeframe === '3m' ? 90 : timeframe === '6m' ? 180 : 365);

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

    // Step 3: Use fallback data if both APIs failed
    if (!historicalData) {
      console.log(`Using fallback data for ${commodityName}`)
      const basePrice = getBasePriceForCommodity(commodityName)
      historicalData = generateFallbackData(commodityName, timeframe, basePrice, isPremium, 'line')
      dataSourceUsed = 'fallback';
      ohlcAvailable = false;
    }

    // Intraday: no provider gives true OHLC bars — never advertise candlesticks.
    if (timeframe === '1d') ohlcAvailable = false;

    // Apply contract-specific price adjustments for IBKR contracts
    if (isIBKRContract && contractSymbol && historicalData) {
      const contractMonth = contractSymbol.slice(-2, -1);
      const contractYearStr = contractSymbol.slice(-1);
      const contractYearNum = parseInt(contractYearStr);
      
      const monthMap: Record<string, number> = {
        'F': 1, 'G': 2, 'H': 3, 'J': 4, 'K': 5, 'M': 6,
        'N': 7, 'Q': 8, 'U': 9, 'V': 10, 'X': 11, 'Z': 12
      };
      
      const expMonth = monthMap[contractMonth] || 0;
      const hasValidExpiry = expMonth > 0 && !isNaN(contractYearNum);
      
      let priceAdjustment = 1.0;
      let volatilityMultiplier = 1.0;
      
      if (hasValidExpiry) {
        const expYear = 2020 + contractYearNum;
        const now = new Date();
        const expDate = new Date(expYear, expMonth - 1, 15);
        const timeToExpiry = (expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      
        if (commodityName.includes('Oil') || commodityName.includes('Gas')) {
          priceAdjustment = 1.0 + (timeToExpiry / 365) * 0.12;
          volatilityMultiplier = 1.0 + Math.abs(timeToExpiry / 365) * 0.4;
        } else {
          priceAdjustment = 1.0 + (timeToExpiry / 365) * 0.06;
          volatilityMultiplier = 1.0 + Math.abs(timeToExpiry / 365) * 0.25;
        }
      }
      
      historicalData = historicalData.map((item: any) => {
        const additionalVolatility = (Math.random() - 0.5) * 0.03 * volatilityMultiplier;
        const finalAdjustment = priceAdjustment * (1 + additionalVolatility);
        
        if (ohlcAvailable && typeof item.open === 'number') {
          return {
            ...item,
            open: item.open * finalAdjustment,
            high: item.high * finalAdjustment,
            low: item.low * finalAdjustment,
            close: item.close * finalAdjustment,
            price: item.price * finalAdjustment,
          };
        } else {
          return { ...item, price: item.price * finalAdjustment };
        }
      });
    }

    // Apply data delay for free users
    if (dataDelay === '15min' && historicalData) {
      historicalData = historicalData.map((item: any) => {
        const parsed = new Date(item.date);
        if (isNaN(parsed.getTime())) return item;
        const delayedDate = new Date(parsed.getTime() - 15 * 60 * 1000);
        const adjustment = 0.995 + Math.random() * 0.01;
        
        if (ohlcAvailable && typeof item.open === 'number') {
          return {
            ...item, date: delayedDate.toISOString(),
            open: item.open * adjustment, high: item.high * adjustment,
            low: item.low * adjustment, close: item.close * adjustment,
            price: item.price * adjustment,
          };
        } else {
          return { ...item, date: delayedDate.toISOString(), price: item.price * adjustment };
        }
      });
    }

    // Cache the result if from a real API source
    if (dataSourceUsed !== 'fallback' && historicalData) {
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
    const basePrice = getBasePriceForCommodity(commodityName || 'WTI Crude Oil');
    const fallbackData = generateFallbackData(commodityName || 'WTI Crude Oil', '1m', basePrice, false, 'line');
    return new Response(
      JSON.stringify({ 
        data: fallbackData, 
        source: 'fallback',
        ohlcAvailable: false,
        error: 'Recovered from error with fallback data'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
