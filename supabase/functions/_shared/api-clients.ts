import { CommodityData } from './types.ts';
import { EdgeLogger, retryWithBackoff, getCachedData, setCachedData } from './utils.ts';
import {
  COMMODITY_PRICE_API_SYMBOLS,
  CENT_QUOTED_SYMBOLS,
  getCommodityByApiSymbol,
  getCommodityCategory,
} from './commodity-mappings.ts';

// API client interface
export interface ApiClient {
  fetchCommodities(): Promise<CommodityData[]>;
  fetchCommodityPrice(commodityName: string): Promise<CommodityData | null>;
}

/**
 * CommodityPriceAPI v2 client.
 * - Auth via `x-api-key` header.
 * - `/rates/latest?symbols=A,B,C,D,E` returns up to 5 symbols per request on Lite plan.
 * - Rate-limited to 10 req/min on Lite — caller MUST cache aggressively.
 */
export class CommodityPriceApiClient implements ApiClient {
  private apiKey: string;
  private baseUrl = 'https://api.commoditypriceapi.com/v2';
  private logger: EdgeLogger;
  private maxSymbolsPerRequest = 5; // Lite plan cap

  constructor(apiKey: string, logger: EdgeLogger) {
    this.apiKey = apiKey;
    this.logger = logger;
  }

  async fetchCommodities(): Promise<CommodityData[]> {
    const cacheKey = 'cpa-all-commodities';
    const cached = getCachedData<CommodityData[]>(cacheKey);
    if (cached) {
      this.logger.info('Returning cached CommodityPriceAPI data');
      return cached;
    }

    const allCommodities: CommodityData[] = [];
    const cpaSymbols = Object.values(COMMODITY_PRICE_API_SYMBOLS);

    // Batch into groups of 5 (Lite plan cap)
    for (let i = 0; i < cpaSymbols.length; i += this.maxSymbolsPerRequest) {
      const batch = cpaSymbols.slice(i, i + this.maxSymbolsPerRequest);
      try {
        const batchData = await this.fetchBatch(batch);
        allCommodities.push(...batchData);
      } catch (error) {
        this.logger.warn(`CPA batch ${i}-${i + batch.length} failed`, error);
      }
      // Throttle to stay under 10 req/min (≥6s spacing)
      if (i + this.maxSymbolsPerRequest < cpaSymbols.length) {
        await new Promise((resolve) => setTimeout(resolve, 6500));
      }
    }

    // Cache for 2 hours to halve burn against CPA Lite plan's 2,000 calls/month quota.
    setCachedData(cacheKey, allCommodities, 2 * 60 * 60 * 1000);
    this.logger.info(`Fetched ${allCommodities.length} commodities from CommodityPriceAPI`);
    return allCommodities;
  }

  async fetchCommodityPrice(commodityName: string): Promise<CommodityData | null> {
    const cpaSymbol = COMMODITY_PRICE_API_SYMBOLS[commodityName];
    if (!cpaSymbol) {
      this.logger.warn(`No CPA symbol mapped for ${commodityName}`);
      return null;
    }
    const cacheKey = `cpa-${cpaSymbol}`;
    const cached = getCachedData<CommodityData>(cacheKey);
    if (cached) return cached;

    const batchData = await this.fetchBatch([cpaSymbol]);
    const data = batchData[0] ?? null;
    if (data) setCachedData(cacheKey, data, 2 * 60 * 60 * 1000);
    return data;
  }

  /** Fetch up to `maxSymbolsPerRequest` symbols in one CPA call. */
  private async fetchBatch(symbols: string[]): Promise<CommodityData[]> {
    if (symbols.length === 0) return [];
    const symbolsParam = symbols.join(',');
    const url = `${this.baseUrl}/rates/latest?symbols=${encodeURIComponent(symbolsParam)}`;

    const response = await retryWithBackoff(async () => {
      const res = await fetch(url, { headers: { 'x-api-key': this.apiKey } });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`CommodityPriceAPI error ${res.status}: ${text.slice(0, 200)}`);
      }
      return res.json();
    });

    if (!response?.success || !response.rates) {
      this.logger.warn('CommodityPriceAPI returned no rates', response);
      return [];
    }

    const out: CommodityData[] = [];
    for (const cpaSymbol of symbols) {
      let rawPrice = response.rates[cpaSymbol];
      if (typeof rawPrice !== 'number') continue;
      // CPA returns some grains in US cents — normalize to USD.
      if (CENT_QUOTED_SYMBOLS.has(cpaSymbol)) rawPrice = rawPrice / 100;

      const commodityName = getCommodityByApiSymbol(cpaSymbol);
      if (!commodityName) continue;

      // CPA latest endpoint doesn't include change/% — these are computed downstream
      // by callers that retain a previous snapshot.
      out.push({
        name: commodityName,
        symbol: cpaSymbol,
        price: rawPrice,
        change: 0,
        changePercent: 0,
        lastUpdate: new Date(
          (response.timestamp ? response.timestamp * 1000 : Date.now())
        ).toISOString(),
        category: getCommodityCategory(commodityName),
      });
    }
    return out;
  }
}

// Multi-source data aggregator — kept for callers that combine OilPriceAPI + CPA.
export class CommodityDataAggregator {
  private clients: ApiClient[];
  private logger: EdgeLogger;

  constructor(clients: ApiClient[], logger: EdgeLogger) {
    this.clients = clients;
    this.logger = logger;
  }

  async fetchAllCommodities(): Promise<CommodityData[]> {
    const allData: CommodityData[] = [];
    const seenCommodities = new Set<string>();

    for (const client of this.clients) {
      try {
        const data = await client.fetchCommodities();
        for (const commodity of data) {
          if (!seenCommodities.has(commodity.name)) {
            allData.push(commodity);
            seenCommodities.add(commodity.name);
          }
        }
      } catch (error) {
        this.logger.warn('Client failed to fetch data', error);
      }
    }

    this.logger.info(
      `Aggregated ${allData.length} unique commodities from ${this.clients.length} sources`
    );
    return allData;
  }

  async fetchCommodityPrice(commodityName: string, _symbol: string): Promise<CommodityData | null> {
    for (const client of this.clients) {
      try {
        const data = await client.fetchCommodityPrice(commodityName);
        if (data) return data;
      } catch (error) {
        this.logger.warn(`Client failed to fetch ${commodityName}`, error);
      }
    }
    this.logger.warn(`No client could fetch data for ${commodityName}`);
    return null;
  }
}
