import { EdgeLogger, EdgePerformanceMonitor } from './utils.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  COMMODITY_SYMBOLS,
  FMP_SYMBOLS,
  MASSIVE_PRODUCT_CODES,
  PREMIUM_COMMODITIES,
} from './commodity-mappings.ts';
import { fetchFmpQuotes, fetchFmpHistorical } from './fmp-client.ts';
import {
  fetchMassiveFrontMonth,
  fetchMassiveFrontMonthBars,
} from './massive-client.ts';

export interface CommodityData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  name: string;
  category: string;
  contractSize: string;
  venue: string;
  /**
   * True when the row came from `buildMissingCommodityFallback` (a synthetic
   * ~base-price guess used purely for UI continuity when no provider returned
   * a quote). Synthetic rows must never be persisted to
   * `commodity_price_snapshots` — doing so poisons the canonical price store
   * and clobbers fresh values written by the warmer.
   */
  isSynthetic?: boolean;
}

export interface ChartDataPoint {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

// Module-scoped cache (per edge instance) — sized for CPA Lite (2K calls/month).
type CacheEntry<T> = { data: T; expiresAt: number };
const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — paid-app model: refresh ~4x/day fits CPA Lite (2K/mo) + OilPriceAPI quotas at 100+ users

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;
  if (entry) cache.delete(key);
  return null;
}
function setCache<T>(key: string, data: T, ttl = CACHE_TTL_MS): void {
  if (cache.size > 200) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

export class CommodityService {
  private logger: EdgeLogger;
  private performanceMonitor: EdgePerformanceMonitor;
  private fmpApiKey: string;
  private oilApiKey: string;
  private alphaVantageApiKey: string;
  private supabaseUrl: string;
  private supabaseAnonKey: string;

  constructor(functionName: string) {
    this.logger = new EdgeLogger({ functionName });
    this.performanceMonitor = new EdgePerformanceMonitor();
    this.fmpApiKey = Deno.env.get('FMP_API_KEY') || '';
    this.oilApiKey = Deno.env.get('OIL_PRICE_API_KEY') || '';
    this.alphaVantageApiKey = Deno.env.get('ALPHA_VANTAGE_API_KEY') || '';
    this.supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    this.supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  }

  async fetchAllCommodities(includePremium = false): Promise<CommodityData[]> {
    const endTimer = this.performanceMonitor.startTimer('fetch-all-commodities');
    try {
      const cacheKey = includePremium ? 'all-commodities:premium' : 'all-commodities:free';
      const cached = getCache<CommodityData[]>(cacheKey);
      if (cached) {
        this.logger.info(`Returning cached snapshot (${cacheKey})`);
        return cached;
      }

      // Massive Starter has unlimited calls, so all three providers run in
      // parallel. Cold-path latency is now bounded by the slowest single
      // request (~1-2s) instead of the old 12s-throttled batches.
      const [fmpResults, oilResults, massiveResults] = await Promise.all([
        this.fetchAllFromFmp(includePremium),
        this.fetchAllFromOilPriceApi(includePremium),
        this.fetchAllFromMassive(includePremium),
      ]);

      const liveResults = [...oilResults, ...fmpResults, ...massiveResults];
      const snapshotResults = await this.fetchSnapshotBackfill(includePremium, liveResults);
      const merged = [...liveResults, ...snapshotResults];
      // A missing upstream quote is unavailable, not an opportunity to invent
      // a plausible number. The client has explicit empty/error states.

      // Compute real day-over-day change against yesterday's snapshot, then
      // upsert today's snapshot. Zero extra provider API calls — only DB I/O.
      // Energy items already have non-zero change from OilPriceAPI; this only
      // back-fills the CPA-sourced items (and is a no-op when change != 0).
      try {
        await this.applyDayOverDayChange(merged);
      } catch (err) {
        this.logger.warn('Day-over-day change computation failed (non-fatal)', err);
      }

      if (merged.length > 0) {
        setCache(cacheKey, merged);
      } else {
        this.logger.warn(`Skipping cache (${cacheKey}): oil=${oilResults.length}, massive=${massiveResults.length}, fmp=${fmpResults.length}`);
      }
      this.logger.info(`Fetched ${merged.length} commodities (oil=${oilResults.length}, massive=${massiveResults.length}, fmp=${fmpResults.length}, premium=${includePremium})`);
      return merged;
    } catch (error) {
      this.logger.error('Failed to fetch commodities', error);
      return [];
    } finally {
      endTimer();
    }
  }

  /**
   * Batch-fetches all non-energy commodities from FMP Starter `/v3/quote/`.
   * One HTTP call: symbols are comma-joined into a single quote URL.
   * Now scoped to ICE/LME-listed items only (11 symbols) — everything
   * Massive can quote has moved off FMP.
   */
  private async fetchAllFromFmp(includePremium = false): Promise<CommodityData[]> {
    if (!this.fmpApiKey) {
      this.logger.warn('No FMP_API_KEY configured');
      return [];
    }
    const targets = Object.entries(FMP_SYMBOLS)
      .filter(([name]) => includePremium || !PREMIUM_COMMODITIES.has(name));
    if (targets.length === 0) return [];

    const symbols = targets.map(([, sym]) => sym);
    const quotes = await fetchFmpQuotes(symbols);
    const bySymbol = new Map(quotes.map((q) => [q.symbol, q]));

    const out: CommodityData[] = [];
    for (const [name, sym] of targets) {
      const q = bySymbol.get(sym);
      if (!q || typeof q.price !== 'number' || !(q.price > 0)) continue;
      const meta = COMMODITY_SYMBOLS[name];
      out.push({
        name,
        symbol: meta?.symbol || sym,
        price: q.price,
        change: typeof q.change === 'number' ? q.change : 0,
        changePercent: typeof q.changesPercentage === 'number' ? q.changesPercentage : 0,
        volume: typeof q.volume === 'number' ? q.volume : undefined,
        category: meta?.category || 'other',
        contractSize: meta?.contractSize || 'TBD',
        venue: meta?.venue || 'Various',
      });
    }
    return out;
  }

  /**
   * Fetches front-month snapshots from Massive Futures Starter in parallel.
   * Starter tier removes the 5 req/min cap and exposes /snapshot (1 call per
   * product). Missing items fall through to the DB snapshot fallback.
   */
  private async fetchAllFromMassive(includePremium = false): Promise<CommodityData[]> {
    const apiKey = Deno.env.get('MASSIVE_API_KEY') || '';
    if (!apiKey) {
      this.logger.warn('No MASSIVE_API_KEY configured');
      return [];
    }
    const targets = Object.entries(MASSIVE_PRODUCT_CODES)
      .filter(([name]) => includePremium || !PREMIUM_COMMODITIES.has(name));
    if (targets.length === 0) return [];

    const results = await Promise.all(
      targets.map(async ([name, code]) => {
        try {
          const fm = await fetchMassiveFrontMonth(code);
          if (!fm) return null;
          const meta = COMMODITY_SYMBOLS[name];
          return {
            name,
            symbol: meta?.symbol || `${code}=F`,
            price: fm.price,
            change: fm.change,
            changePercent: fm.changePercent,
            volume: fm.volume,
            category: meta?.category || 'other',
            contractSize: meta?.contractSize || 'TBD',
            venue: meta?.venue || 'CME',
          } as CommodityData;
        } catch (err) {
          this.logger.warn(`Massive snapshot failed for ${name}`, err);
          return null;
        }
      }),
    );
    return results.filter((r): r is CommodityData => r !== null);
  }

  /**
   * Retired 2026-07-14: OilPriceAPI decommissioned; all commodities now flow
   * through Massive Futures via `fetchAllFromMassive`. Kept as a no-op so
   * older code paths and tests don't break.
   */
  private async fetchAllFromOilPriceApi(includePremium = false): Promise<CommodityData[]> {
    void includePremium;
    return [];
  }

  /**
   * Premium energy prices are warmed into commodity_price_snapshots by
   * warm-energy-prices. The user-facing oil-price-api endpoint correctly gates
   * premium symbols by JWT, but this shared service calls it with the anon key,
   * so premium energy would otherwise fall through to synthetic placeholders.
   */
  private async fetchSnapshotBackfill(
    includePremium: boolean,
    existing: CommodityData[],
  ): Promise<CommodityData[]> {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!this.supabaseUrl || !serviceKey) return [];

    const existingNames = new Set(existing.map((c) => c.name));
    const targets = Object.entries(COMMODITY_SYMBOLS)
      .filter(([name]) =>
        !existingNames.has(name) &&
        (includePremium || !PREMIUM_COMMODITIES.has(name))
      )
      .map(([name]) => name);
    if (targets.length === 0) return [];

    const sb = createClient(this.supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await sb
      .from('commodity_price_snapshots')
      .select('commodity_name, price, snapshot_date, created_at')
      .in('commodity_name', targets)
      .gte('snapshot_date', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);

    if (error || !data) {
      if (error) this.logger.warn('Energy snapshot backfill failed', error.message);
      return [];
    }

    const latestByName = new Map<string, { price: number; snapshot_date: string }>();
    for (const row of data as Array<{ commodity_name: string; price: number; snapshot_date: string }>) {
      if (!latestByName.has(row.commodity_name)) {
        latestByName.set(row.commodity_name, {
          price: Number(row.price),
          snapshot_date: row.snapshot_date,
        });
      }
    }

    return targets.flatMap((name) => {
      const snap = latestByName.get(name);
      const meta = COMMODITY_SYMBOLS[name];
      if (!snap || !meta || !Number.isFinite(snap.price) || snap.price <= 0) return [];
      return [{
        name,
        symbol: meta.symbol,
        price: snap.price,
        change: 0,
        changePercent: 0,
        category: meta.category,
        contractSize: meta.contractSize,
        venue: meta.venue,
      } as CommodityData];
    });
  }

  async fetchCurrentPrice(commodityName: string): Promise<CommodityData | null> {
    const all = await this.fetchAllCommodities();
    return all.find((c) => c.name === commodityName) || null;
  }

  /**
   * Compute change/changePercent vs yesterday's stored snapshot, then upsert
   * today's prices. CPA `/rates/latest` doesn't return prior-close, so this
   * is the cheapest way to get real day-over-day deltas: 0 extra API calls,
   * just one DB read + one bulk upsert per provider refresh.
   */
  private async applyDayOverDayChange(merged: CommodityData[]): Promise<void> {
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!this.supabaseUrl || !serviceKey || merged.length === 0) return;

    const sb = createClient(this.supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });
    const today = new Date().toISOString().slice(0, 10);
    const names = merged.map((c) => c.name);

    // Fetch the most recent snapshot per commodity that's older than today.
    // Keep it simple: pull the last ~14 days for these names and pick the
    // freshest pre-today row in JS (avoids a per-row distinct-on query).
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const { data: rows, error } = await sb
      .from('commodity_price_snapshots')
      .select('commodity_name, price, snapshot_date')
      .in('commodity_name', names)
      .gte('snapshot_date', fourteenDaysAgo)
      .lt('snapshot_date', today)
      .order('snapshot_date', { ascending: false });

    if (error) {
      this.logger.warn('Snapshot read failed', error.message);
    } else if (rows && rows.length > 0) {
      const prevByName = new Map<string, number>();
      for (const r of rows as Array<{ commodity_name: string; price: number }>) {
        if (!prevByName.has(r.commodity_name)) {
          prevByName.set(r.commodity_name, Number(r.price));
        }
      }
      for (const c of merged) {
        if (c.change !== 0 || c.changePercent !== 0) continue; // already populated
        const prev = prevByName.get(c.name);
        if (typeof prev !== 'number' || prev <= 0 || !Number.isFinite(prev)) continue;
        const diff = c.price - prev;
        c.change = Math.round(diff * 10000) / 10000;
        c.changePercent = Math.round((diff / prev) * 10000) / 100;
      }
    }

    // Upsert today's snapshot for every commodity with a valid price.
    const payload = merged
      .filter((c) => !c.isSynthetic && Number.isFinite(c.price) && c.price > 0)
      .map((c) => ({
        commodity_name: c.name,
        price: c.price,
        snapshot_date: today,
      }));
    if (payload.length > 0) {
      const { error: upErr } = await sb
        .from('commodity_price_snapshots')
        .upsert(payload, { onConflict: 'commodity_name,snapshot_date' });
      if (upErr) this.logger.warn('Snapshot upsert failed', upErr.message);
    }
  }

  async fetchCommodityChart(
    commodityName: string,
    timeframe: string,
    chartType: string = 'line'
  ): Promise<ChartDataPoint[]> {
    const endTimer = this.performanceMonitor.startTimer(`fetch-chart-${commodityName}`);
    try {
      const cacheKey = `chart:${commodityName}:${timeframe}:${chartType}`;
      const cached = getCache<ChartDataPoint[]>(cacheKey);
      if (cached) return cached;

      const fmpSym = FMP_SYMBOLS[commodityName];
      const massiveCode = MASSIVE_PRODUCT_CODES[commodityName];

      // Prefer Massive for CME-side names.
      if (massiveCode) {
        const data = await this.fetchMassiveTimeseries(massiveCode, timeframe, chartType);
        if (data.length > 0) {
          setCache(cacheKey, data);
          return data;
        }
      }

      if (fmpSym && this.fmpApiKey) {
        const data = await this.fetchFmpTimeseries(fmpSym, timeframe, chartType);
        if (data.length > 0) {
          setCache(cacheKey, data);
          return data;
        }
      }

      if (this.alphaVantageApiKey) {
        const avData = await this.fetchAlphaVantageChart(commodityName);
        if (avData.length > 0) {
          setCache(cacheKey, avData);
          return avData;
        }
      }

      this.logger.warn(`No verified chart data for ${commodityName}`);
      return [];
    } catch (error) {
      this.logger.error(`Failed to fetch chart data for ${commodityName}`, error);
      return [];
    } finally {
      endTimer();
    }
  }

  private async fetchFmpTimeseries(
    fmpSym: string,
    timeframe: string,
    chartType: string
  ): Promise<ChartDataPoint[]> {
    const daysMap: Record<string, number> = {
      '1d': 2, '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365,
    };
    const days = daysMap[timeframe] || 30;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 86400000);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const bars = await fetchFmpHistorical(fmpSym, startStr, endStr);
    return bars.map((b) => {
      const point: ChartDataPoint = { date: b.date, price: b.close };
      if (chartType === 'candlestick') {
        point.open = b.open;
        point.high = b.high;
        point.low = b.low;
        point.close = b.close;
      }
      return point;
    });
  }

  private async fetchMassiveTimeseries(
    productCode: string,
    timeframe: string,
    chartType: string,
  ): Promise<ChartDataPoint[]> {
    const daysMap: Record<string, number> = {
      '1d': 2, '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365,
    };
    const days = daysMap[timeframe] || 30;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 86400000);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const bars = await fetchMassiveFrontMonthBars(productCode, startStr, endStr);
    return bars.map((b) => {
      const point: ChartDataPoint = { date: b.date, price: b.close };
      if (chartType === 'candlestick') {
        point.open = b.open;
        point.high = b.high;
        point.low = b.low;
        point.close = b.close;
      }
      return point;
    });
  }

  private async fetchAlphaVantageChart(commodityName: string): Promise<ChartDataPoint[]> {
    try {
      const avSymbolMap: Record<string, string> = {
        'WTI Crude Oil': 'WTI',
        'Brent Crude Oil': 'BRENT',
        'Natural Gas': 'NATURAL_GAS',
        'Corn Futures': 'CORN',
        'Wheat Futures': 'WHEAT',
        'Soybean Futures': 'SOYBEANS',
        'Sugar #11': 'SUGAR',
        Cotton: 'COTTON',
        'Coffee Arabica': 'COFFEE',
      };
      const symbol = avSymbolMap[commodityName];
      if (!symbol) return [];

      const response = await fetch(
        `https://www.alphavantage.co/query?function=${symbol}&interval=monthly&apikey=${this.alphaVantageApiKey}`
      );
      if (!response.ok) return [];
      const data = await response.json();
      const series = (data?.data || []) as Array<{ date: string; value: string }>;
      return series
        .map((it) => ({ date: it.date, price: parseFloat(it.value) || 0 }))
        .reverse();
    } catch (err) {
      this.logger.warn('Alpha Vantage fetch failed', err);
      return [];
    }
  }


  applyDataDelay(data: CommodityData[], delay: string): CommodityData[] {
    if (delay !== '15min') return data;
    // Delayed users receive the last verified snapshot, not altered prices.
    return data;
  }

  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }
}
