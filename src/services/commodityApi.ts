// Commodity price API service — thin client that delegates to Supabase edge
// functions (CommodityPriceAPI for non-energy, OilPriceAPI for energy).
// FMP & Yahoo direct calls were removed in the CPA migration; see
// mem://integrations/commoditypriceapi-config for full architecture notes.
import { supabase } from '@/integrations/supabase/client';

export interface CommodityPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate: string;
}

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  urlToImage?: string;
}

export interface CommodityInfo {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  category: string;
}

/** Raw item shape returned by the fetch-all-commodities edge function. */
interface RawCommodityItem {
  symbol?: string;
  name?: string;
  commodityName?: string;
  price?: number | string;
  change?: number | string;
  changePercent?: number | string;
  changesPercentage?: number | string;
  category?: string;
}

interface FetchAllCommoditiesResponse {
  commodities?: RawCommodityItem[];
  data?: RawCommodityItem[];
  source: string;
  count: number;
  timestamp: string;
  dataDelay: 'realtime' | '15min';
  isDelayed: boolean;
  isPremium: boolean;
}

export interface HistoricalDataPoint {
  date: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  price: number;
}

interface FetchCommodityDataResponse {
  data?: HistoricalDataPoint[];
  history?: HistoricalDataPoint[];
  source: string;
  ohlcAvailable: boolean;
  commodity: string;
  symbol: string;
  realTime: boolean;
  dataPoints: number;
  chartType: string;
  dataDelay: 'realtime' | '15min';
  isDelayed: boolean;
  cached?: boolean;
}

export class CommodityApiService {
  private static instance: CommodityApiService;
  private cache = new Map<string, { data: unknown; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000;

  static getInstance(): CommodityApiService {
    if (!CommodityApiService.instance) {
      CommodityApiService.instance = new CommodityApiService();
    }
    return CommodityApiService.instance;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /** All commodities via the cached fetch-all-commodities edge function. */
  async fetchAvailableCommodities(): Promise<CommodityInfo[]> {
    const cacheKey = 'available_commodities';
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data as CommodityInfo[];

    try {
      const { data, error } = await supabase.functions.invoke<FetchAllCommoditiesResponse>(
        'fetch-all-commodities',
        { body: {} },
      );
      if (error) throw error;
      const items: RawCommodityItem[] = data?.commodities || data?.data || [];
      const commodities: CommodityInfo[] = items.map((item) => ({
        symbol: item.symbol || '',
        name: item.name || item.commodityName || item.symbol || '',
        price: parseFloat(String(item.price)) || 0,
        change: parseFloat(String(item.change)) || 0,
        changePercent: parseFloat(String(item.changePercent ?? item.changesPercentage)) || 0,
        category: item.category || 'other',
      })).filter((it) => it.symbol && it.name);

      this.cache.set(cacheKey, { data: commodities, timestamp: Date.now() });
      return commodities;
    } catch (error) {
      console.error('Error fetching commodities:', error);
      return [];
    }
  }

  async fetchCommodityPrice(commodityName: string): Promise<CommodityPrice | null> {
    const cacheKey = `price_${commodityName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data as CommodityPrice;

    try {
      const all = await this.fetchAvailableCommodities();
      const match = all.find((c) => c.name === commodityName);
      if (match) {
        const price: CommodityPrice = {
          symbol: match.symbol,
          price: match.price,
          change: match.change,
          changePercent: match.changePercent,
          lastUpdate: new Date().toISOString(),
        };
        this.cache.set(cacheKey, { data: price, timestamp: Date.now() });
        return price;
      }
    } catch (error) {
      console.warn(`Edge function failed for ${commodityName}:`, error);
    }

    // Never manufacture a quote. Callers render their explicit unavailable state.
    return null;
  }

  // REMOVED 2026-08-26: fetchCommodityNews().
  //
  // It had no callers anywhere in the app, and the path it went down was the
  // expensive one: fetchNewsFromMarketaux -> the fetch-commodity-news edge
  // function, which fired THREE NewsAPI.org requests per invocation against
  // a free plan licensed for development use only and capped at 100
  // requests/day across all users.
  //
  // Per-commodity news now comes from the RSS-backed commodity_news_feed
  // table via the enhanced-commodity-news function — no API key, no quota.
  // See supabase/functions/_shared/commodity-news-match.ts.

  /** Historical chart data via the fetch-commodity-data edge function (CPA + OilPriceAPI). */
  async fetchHistoricalData(commodityName: string, timeframe = '1m'): Promise<HistoricalDataPoint[]> {
    const cacheKey = `historical_${commodityName}_${timeframe}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data as HistoricalDataPoint[];

    try {
      const { data, error } = await supabase.functions.invoke<FetchCommodityDataResponse>(
        'fetch-commodity-data',
        { body: { commodity: commodityName, timeframe } },
      );
      if (!error) {
        const points = data?.data || data?.history || [];
        if (Array.isArray(points) && points.length > 0) {
          this.cache.set(cacheKey, { data: points, timestamp: Date.now() });
          return points;
        }
      }
    } catch (error) {
      console.warn(`Historical edge function failed for ${commodityName}:`, error);
    }

    // Never manufacture history. Empty history has a clear, non-actionable meaning.
    return [];
  }
}

export const commodityApi = CommodityApiService.getInstance();
