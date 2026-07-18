// Commodity price API service — thin client that delegates to Supabase edge
// functions (CommodityPriceAPI for non-energy, OilPriceAPI for energy).
// FMP & Yahoo direct calls were removed in the CPA migration; see
// mem://integrations/commoditypriceapi-config for full architecture notes.
import {
  fetchNewsFromMarketaux,
  removeDuplicateNews,
  sortNewsByRelevance,
  getFallbackNews,
} from './newsHelpers';
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

// Local fallback prices used only if every edge function call fails.
const BASE_PRICES: Record<string, number> = {
  'Gold Futures': 2000, 'Silver Futures': 25, 'Copper': 4.2,
  'Platinum': 950, 'Palladium': 1800,
  'WTI Crude Oil': 65, 'Brent Crude Oil': 67, 'Natural Gas': 2.85,
  'Gasoline RBOB': 2.1, 'Heating Oil': 2.3,
  'Corn Futures': 4.30, 'Wheat Futures': 5.50, 'Soybean Futures': 11.50,
  'Coffee Arabica': 1.65, 'Sugar #11': 19.75, 'Cotton': 72.80,
  'Cocoa': 2800, 'Lumber Futures': 450, 'Orange Juice': 120,
};

const getBasePriceForCommodity = (commodityName: string): number =>
  BASE_PRICES[commodityName] || 100;

const generateFallbackHistoricalData = (
  commodityName: string,
  timeframe: string,
  basePrice: number
): Array<{ date: string; price: number }> => {
  const dataPoints =
    timeframe === '1d' ? 24
      : timeframe === '7d' ? 7
      : timeframe === '1m' ? 30
      : timeframe === '3m' ? 90
      : 180;
  const data: Array<{ date: string; price: number }> = [];
  const now = new Date();
  let currentPrice = basePrice;
  const volatility = basePrice * (timeframe === '1d' ? 0.015 : timeframe === '1m' ? 0.03 : 0.05);

  for (let i = dataPoints - 1; i >= 0; i--) {
    const date = timeframe === '1d'
      ? new Date(now.getTime() - i * 60 * 60 * 1000)
      : new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    currentPrice += (Math.random() - 0.5) * volatility * 2;
    currentPrice = Math.max(basePrice * 0.7, Math.min(basePrice * 1.3, currentPrice));
    data.push({ date: date.toISOString(), price: Math.round(currentPrice * 100) / 100 });
  }
  return data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export class CommodityApiService {
  private static instance: CommodityApiService;
  private cache = new Map<string, { data: any; timestamp: number }>();
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
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data;

    try {
      const { data, error } = await supabase.functions.invoke('fetch-all-commodities', {
        body: {},
      });
      if (error) throw error;
      const items: any[] = data?.commodities || data?.data || [];
      const commodities: CommodityInfo[] = items.map((item) => ({
        symbol: item.symbol || '',
        name: item.name || item.commodityName || item.symbol || '',
        price: parseFloat(item.price) || 0,
        change: parseFloat(item.change) || 0,
        changePercent: parseFloat(item.changePercent ?? item.changesPercentage) || 0,
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
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data;

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

    // Fallback synthetic price
    const basePrice = getBasePriceForCommodity(commodityName);
    return {
      symbol: commodityName,
      price: basePrice,
      change: (Math.random() - 0.5) * basePrice * 0.02,
      changePercent: (Math.random() - 0.5) * 4,
      lastUpdate: new Date().toISOString(),
    };
  }

  async fetchCommodityNews(commodityName: string, limit = 5): Promise<NewsItem[]> {
    const cacheKey = `news_${commodityName}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data;

    try {
      const news = await fetchNewsFromMarketaux(commodityName);
      const unique = removeDuplicateNews(news);
      const sorted = sortNewsByRelevance(unique, commodityName);
      const result = sorted.length > 0
        ? sorted.slice(0, limit)
        : getFallbackNews(commodityName).slice(0, limit);
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error(`Error fetching news for ${commodityName}:`, error);
      return getFallbackNews(commodityName).slice(0, limit);
    }
  }

  /** Historical chart data via the fetch-commodity-data edge function (CPA + OilPriceAPI). */
  async fetchHistoricalData(commodityName: string, timeframe = '1m'): Promise<any[]> {
    const cacheKey = `historical_${commodityName}_${timeframe}`;
    const cached = this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached.timestamp)) return cached.data;

    try {
      const { data, error } = await supabase.functions.invoke('fetch-commodity-data', {
        body: { commodity: commodityName, timeframe },
      });
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

    const fallback = generateFallbackHistoricalData(
      commodityName,
      timeframe,
      getBasePriceForCommodity(commodityName)
    );
    this.cache.set(cacheKey, { data: fallback, timestamp: Date.now() });
    return fallback;
  }
}

export const commodityApi = CommodityApiService.getInstance();
