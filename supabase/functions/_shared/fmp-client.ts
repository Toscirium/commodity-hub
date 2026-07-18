// Shared FMP Starter client for spot quotes, historical bars, and real
// monthly futures contracts. All commodities (non-energy) flow through here
// since the CommodityPriceAPI migration on 2026-05.
//
// Endpoints used:
//   - GET /v3/quote/{SYM1,SYM2,…}              — batched spot quotes (Starter+)
//   - GET /v3/historical-price-full/{SYM}      — daily OHLC bars
//   - GET /v3/quote/{ROOT}{MONTH}{YY}          — individual monthly contracts
//
// Starter plan caps: ~300 req/min, ~10K/day, ~300K/month. Our usage with the
// 6h shared cache is <2% of the monthly budget.

// FMP "stable" API (new accounts post-2025-08-31 don't have /api/v3).
// /stable/quote?symbol=SYM[,SYM,…] returns the same shape as the old
// /api/v3/quote/SYM endpoint.
const FMP_BASE = 'https://financialmodelingprep.com/stable';
const FMP_LEGACY_BASE = 'https://financialmodelingprep.com/api/v3';
const MONTH_CODES = ['F','G','H','J','K','M','N','Q','U','V','X','Z'];

export interface FmpQuote {
  symbol: string;
  price: number | null;
  change: number | null;
  changesPercentage: number | null;
  volume: number | null;
  timestamp: number | null;
}

export interface FmpHistoricalBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface FmpFuturesContract {
  symbol: string;
  expiry: string;
  monthIdx: number;
  price: number | null;
}

function getKey(): string {
  return Deno.env.get('FMP_API_KEY') || '';
}

/** Batched quote for N symbols in one call. Returns empty array on any failure. */
export async function fetchFmpQuotes(symbols: string[]): Promise<FmpQuote[]> {
  const key = getKey();
  if (!key || symbols.length === 0) return [];
  // Stable endpoint /stable/quote accepts a single ?symbol= value. Fan out
  // to one request per symbol in parallel (Starter plan: ~300 req/min).
  const out = await Promise.all(symbols.map((sym) => fetchOneStableQuote(sym, key)));
  return out.filter((q): q is FmpQuote => q !== null);
}

async function fetchOneStableQuote(symbol: string, key: string): Promise<FmpQuote | null> {
  const url = `${FMP_BASE}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
  try {
    // Hard 6s per-symbol timeout — a single stuck FMP request used to drag
    // the whole all-commodities batch to 30s+ via Promise.all.
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(t));
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[fmp] quote ${symbol} -> ${res.status} ${txt.slice(0, 200)}`);
      return null;
    }
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      console.warn(`[fmp] quote ${symbol} -> empty`);
      return null;
    }
    const q = arr[0];
    return {
      symbol: String(q.symbol ?? symbol),
      price: typeof q.price === 'number' ? q.price : null,
      change: typeof q.change === 'number' ? q.change : null,
      changesPercentage: typeof q.changePercentage === 'number'
        ? q.changePercentage
        : (typeof q.changesPercentage === 'number' ? q.changesPercentage : null),
      volume: typeof q.volume === 'number' ? q.volume : null,
      timestamp: typeof q.timestamp === 'number' ? q.timestamp : null,
    };
  } catch {
    return null;
  }
}

/** Single-symbol convenience wrapper. */
export async function fetchFmpQuote(symbol: string): Promise<FmpQuote | null> {
  const out = await fetchFmpQuotes([symbol]);
  return out[0] ?? null;
}

/** Historical daily OHLC bars between start/end dates (YYYY-MM-DD). */
export async function fetchFmpHistorical(
  symbol: string,
  fromDate: string,
  toDate: string,
): Promise<FmpHistoricalBar[]> {
  const key = getKey();
  if (!key) return [];
  // Stable equivalent of /api/v3/historical-price-full/{SYM}.
  const url = `${FMP_BASE}/historical-price-eod/full?symbol=${encodeURIComponent(symbol)}&from=${fromDate}&to=${toDate}&apikey=${key}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`[fmp] historical ${symbol} -> ${res.status} ${txt.slice(0, 200)}`);
      return [];
    }
    const json = await res.json();
    // Stable returns either a bare array or { historical: [...] }
    const hist = Array.isArray(json) ? json : json?.historical;
    if (!Array.isArray(hist)) return [];
    return hist
      .map((b: any) => ({
        date: String(b.date ?? ''),
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.close),
        volume: typeof b.volume === 'number' ? b.volume : undefined,
      }))
      .filter((b) => b.date && Number.isFinite(b.close))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * Build an N-month forward curve from individual FMP monthly contract quotes.
 * Symbol convention: `{ROOT}{MONTH_CODE}{YY}` (e.g. `GCG26` = Gold Feb 2026).
 * Issues a single batched /v3/quote/ call for all N contracts.
 */
export async function fetchFmpFuturesCurve(
  root: string,
  monthsAhead: number,
): Promise<FmpFuturesContract[]> {
  const now = new Date();
  const contracts: { symbol: string; expiry: string; monthIdx: number }[] = [];
  for (let i = 1; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const code = MONTH_CODES[d.getMonth()];
    const yr = String(d.getFullYear() % 100).padStart(2, '0');
    contracts.push({
      symbol: `${root}${code}${yr}`,
      expiry: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      monthIdx: i,
    });
  }

  const quotes = await fetchFmpQuotes(contracts.map((c) => c.symbol));
  const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));

  return contracts.map((c) => ({
    symbol: c.symbol,
    expiry: c.expiry,
    monthIdx: c.monthIdx,
    price: priceBySymbol.get(c.symbol) ?? null,
  }));
}