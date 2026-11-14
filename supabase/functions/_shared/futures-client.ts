// Futures market-data client backed by Yahoo Finance's public chart/spark
// endpoints (free, no API key). Replaced Massive Futures Starter (paid) on
// 2026-11-14.
//
// Coverage: every CME/CBOT/COMEX/NYMEX root in FUTURES_PRODUCT_CODES, both the
// continuous front month (`CL=F`) and individual contract months
// (`CLF27.NYM`). Quotes are delayed (~10-30 min) — fine for our EOD-quality
// flows, which also sit behind a 6h edge cache + DB snapshots.
//
// Caveats:
//  - Unofficial endpoints: no SLA, Yahoo may rate-limit shared edge IPs (we
//    fall back from query1 → query2 and callers already degrade to DB
//    snapshots on empty results).
//  - Yahoo's terms restrict commercial redistribution of its data.
//
// Tickers returned to callers (curve `symbol`, front-month `ticker`) use the
// plain exchange format (`CLF27`), same as the previous Massive client, so
// rows already stored in the DB stay comparable. Conversion to Yahoo's
// suffixed format happens internally.

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (compatible; CommodityHub/1.0)';
const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];

/** Yahoo exchange suffix for single-contract tickers, by product root. */
const EXCHANGE_SUFFIX: Record<string, string> = {
  // NYMEX
  CL: 'NYM', BZ: 'NYM', NG: 'NYM', RB: 'NYM', HO: 'NYM', PL: 'NYM', PA: 'NYM', HRC: 'NYM',
  // COMEX
  GC: 'CMX', SI: 'CMX', HG: 'CMX', MGC: 'CMX', SIL: 'CMX', MHG: 'CMX',
  // CBOT
  ZC: 'CBT', ZW: 'CBT', KE: 'CBT', ZS: 'CBT', ZL: 'CBT', ZM: 'CBT', ZO: 'CBT', ZR: 'CBT',
  // CME
  LE: 'CME', GF: 'CME', HE: 'CME', DC: 'CME', DY: 'CME', CB: 'CME', GNF: 'CME', CSC: 'CME', LBR: 'CME',
};

export interface FrontMonth {
  ticker: string;
  productCode: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  asOf: string;
}

export interface DailyBar {
  date: string; // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CurvePoint {
  symbol: string;
  expiry: string; // contract month, 'YYYY-MM'
  monthIdx: number;
  price: number;
}

// deno-lint-ignore no-explicit-any
async function getJson(path: string, params: Record<string, string | number>): Promise<any | null> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  for (const host of HOSTS) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      const res = await fetch(`${host}${path}?${qs}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ctl.signal,
      }).finally(() => clearTimeout(t));
      if (res.ok) return await res.json();
      // 404 = unknown symbol; no point retrying on the other host.
      if (res.status === 404) return null;
    } catch {
      // timeout / network — try next host
    }
  }
  return null;
}

/** 'CLF27' → 'CLF27.NYM'; 'CL=F' and already-suffixed tickers pass through. */
function toYahooTicker(ticker: string): string {
  if (ticker.includes('=') || ticker.includes('.')) return ticker;
  const m = ticker.match(/^([A-Z]+)([FGHJKMNQUVXZ])(\d{2})$/);
  if (!m) return ticker;
  const suffix = EXCHANGE_SUFFIX[m[1]];
  return suffix ? `${ticker}.${suffix}` : ticker;
}

function fromYahooTicker(ticker: string): string {
  return ticker.replace(/\.(NYM|CMX|CBT|CME)$/, '');
}

/** Trading date of a Yahoo bar timestamp, in the exchange's local calendar. */
function barDate(ts: number, gmtoffset: number): string {
  return new Date((ts + (gmtoffset || 0)) * 1000).toISOString().slice(0, 10);
}

// deno-lint-ignore no-explicit-any
function parseBars(result: any): DailyBar[] {
  const ts: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0] ?? {};
  const off = Number(result?.meta?.gmtoffset) || 0;
  const out: DailyBar[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ts.length; i++) {
    const close = Number(q.close?.[i]);
    if (!Number.isFinite(close) || close <= 0) continue;
    const date = barDate(ts[i], off);
    if (seen.has(date)) continue; // Yahoo sometimes duplicates the live bar
    seen.add(date);
    const open = Number(q.open?.[i]);
    const high = Number(q.high?.[i]);
    const low = Number(q.low?.[i]);
    const vol = Number(q.volume?.[i]);
    out.push({
      date,
      open: Number.isFinite(open) && open > 0 ? open : close,
      high: Number.isFinite(high) && high > 0 ? high : close,
      low: Number.isFinite(low) && low > 0 ? low : close,
      close,
      volume: Number.isFinite(vol) ? vol : undefined,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function toEpochSec(date: string): number {
  return Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
}

/** Most recent business-day-ish date (yesterday in UTC). */
export function yesterdayUtcDate(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Daily OHLC bars between two dates (inclusive). `ticker` may be a continuous
 * symbol (`CL=F`) or a contract (`CLF27`). Empty array on failure.
 */
export async function fetchDailyBars(ticker: string, fromDate: string, toDate: string): Promise<DailyBar[]> {
  const json = await getJson(`/v8/finance/chart/${encodeURIComponent(toYahooTicker(ticker))}`, {
    period1: toEpochSec(fromDate),
    period2: toEpochSec(toDate) + 86400,
    interval: '1d',
  });
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  return parseBars(result).filter((b) => b.date >= fromDate && b.date <= toDate);
}

/** Close for a contract on (or the last session before) `date`. */
export async function fetchContractDailyClose(ticker: string, date: string): Promise<number | null> {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const bars = await fetchDailyBars(ticker, start.toISOString().slice(0, 10), date);
  const last = bars[bars.length - 1];
  return last ? last.close : null;
}

/** Continuous front-month quote (`<root>=F`) with day-over-day change. */
export async function fetchFrontMonth(productCode: string): Promise<FrontMonth | null> {
  const json = await getJson(`/v8/finance/chart/${encodeURIComponent(`${productCode}=F`)}`, {
    range: '10d',
    interval: '1d',
  });
  const result = json?.chart?.result?.[0];
  if (!result) return null;
  const meta = result.meta ?? {};
  const bars = parseBars(result);
  const last = bars[bars.length - 1];
  const livePrice = Number(meta.regularMarketPrice);
  const price = Number.isFinite(livePrice) && livePrice > 0 ? livePrice : last?.close;
  if (!price || !Number.isFinite(price)) return null;

  const asOf = Number.isFinite(Number(meta.regularMarketTime))
    ? barDate(Number(meta.regularMarketTime), Number(meta.gmtoffset) || 0)
    : last?.date ?? yesterdayUtcDate();
  // Previous close = last completed bar strictly before the quote's session.
  const prev = [...bars].reverse().find((b) => b.date < asOf)?.close;
  let change = prev ? price - prev : 0;
  let changePercent = prev ? (change / prev) * 100 : 0;
  // A single-session move beyond this on these contracts almost always means
  // a bad prior bar (thin dairy/lumber prints, roll gaps on the continuous
  // series), not a real move. Zero it so the day-over-day snapshot fallback
  // in commodity-service.ts fills it in instead of showing an impossible %.
  const IMPLAUSIBLE_DAILY_MOVE_PCT = 20;
  if (!Number.isFinite(changePercent) || Math.abs(changePercent) > IMPLAUSIBLE_DAILY_MOVE_PCT) {
    change = 0;
    changePercent = 0;
  }
  const volume = bars.find((b) => b.date === asOf)?.volume;

  return {
    ticker: `${productCode}=F`,
    productCode,
    price: +price.toFixed(4),
    change: +change.toFixed(4),
    changePercent: +changePercent.toFixed(4),
    volume,
    asOf,
  };
}

/** Continuous front-month daily bars — used for charts, vol cones, backtests. */
export async function fetchFrontMonthBars(productCode: string, fromDate: string, toDate: string): Promise<DailyBar[]> {
  return await fetchDailyBars(`${productCode}=F`, fromDate, toDate);
}

/**
 * Forward curve of up to `monthsAhead` listed contracts. Yahoo has no
 * contract-listing endpoint, so we enumerate every calendar month for the
 * next few years and batch-probe them via /v7/finance/spark (20 per call);
 * only months that are actually listed and recently priced come back.
 */
export async function fetchFuturesCurve(
  productCode: string,
  monthsAhead: number,
): Promise<{ asOf: string; curve: CurvePoint[] }> {
  const suffix = EXCHANGE_SUFFIX[productCode];
  if (!suffix) return { asOf: yesterdayUtcDate(), curve: [] };

  // Some products list only 5-6 months a year, so scan well past monthsAhead.
  const scanMonths = Math.min(Math.max(monthsAhead * 3, 24), 72);
  const now = new Date();
  const candidates: { ticker: string; expiry: string }[] = [];
  for (let i = 0; i < scanMonths; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    const yy = String(d.getUTCFullYear()).slice(2);
    const mm = d.getUTCMonth();
    candidates.push({
      ticker: `${productCode}${MONTH_CODES[mm]}${yy}.${suffix}`,
      expiry: `${d.getUTCFullYear()}-${String(mm + 1).padStart(2, '0')}`,
    });
  }

  const batches: string[][] = [];
  for (let i = 0; i < candidates.length; i += 20) {
    batches.push(candidates.slice(i, i + 20).map((c) => c.ticker));
  }
  const responses = await Promise.all(
    batches.map((symbols) => getJson('/v7/finance/spark', { symbols: symbols.join(','), range: '5d', interval: '1d' })),
  );

  const quoteByTicker = new Map<string, { price: number; time: number; off: number }>();
  for (const json of responses) {
    for (const r of json?.spark?.result ?? []) {
      const resp = r?.response?.[0];
      const meta = resp?.meta ?? {};
      const price = Number(meta.regularMarketPrice);
      const time = Number(meta.regularMarketTime);
      if (r?.symbol && Number.isFinite(price) && price > 0 && Number.isFinite(time)) {
        quoteByTicker.set(String(r.symbol), { price, time, off: Number(meta.gmtoffset) || 0 });
      }
    }
  }
  if (quoteByTicker.size === 0) return { asOf: yesterdayUtcDate(), curve: [] };

  // Drop expired/stale contracts: anything last priced >10 days before the
  // freshest contract in the strip.
  const newest = Math.max(...[...quoteByTicker.values()].map((q) => q.time));
  const fresh = candidates.filter((c) => {
    const q = quoteByTicker.get(c.ticker);
    return q && newest - q.time < 10 * 86400;
  });

  const curve = fresh.slice(0, monthsAhead).map((c, i) => ({
    symbol: fromYahooTicker(c.ticker),
    expiry: c.expiry,
    monthIdx: i + 1,
    price: +quoteByTicker.get(c.ticker)!.price.toFixed(4),
  }));
  const front = curve[0] ? quoteByTicker.get(fresh[0].ticker)! : null;
  return {
    asOf: front ? barDate(front.time, front.off) : yesterdayUtcDate(),
    curve,
  };
}
