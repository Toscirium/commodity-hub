// Massive Futures Starter client.
// Docs: https://massive.com/docs/rest/futures
// Auth: Authorization: Bearer ${MASSIVE_API_KEY}
// Limits (Futures Starter): unlimited calls, 15-min delayed, 5y history,
// /snapshot endpoint enabled. We still cache 6h in the edge worker because
// most of our flows are EOD-quality and we want to keep latency flat.

const BASE = 'https://api.massive.com';
const FUTURES_MONTH_CODES: Record<string, number> = {
  F: 1,
  G: 2,
  H: 3,
  J: 4,
  K: 5,
  M: 6,
  N: 7,
  Q: 8,
  U: 9,
  V: 10,
  X: 11,
  Z: 12,
};

function key(): string {
  return Deno.env.get('MASSIVE_API_KEY') || '';
}

async function get(path: string, params: Record<string, string | number | boolean> = {}) {
  const k = key();
  if (!k) return null;
  const qs = new URLSearchParams(
    Object.entries(params).map(([n, v]) => [n, String(v)]),
  ).toString();
  const url = `${BASE}${path}${qs ? `?${qs}` : ''}`;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${k}` },
      signal: ctl.signal,
    }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function dateFromEpoch(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  // Massive timestamps are usually nanoseconds; some minute fields are ms.
  const ms = value > 1e15 ? value / 1_000_000 : value;
  return new Date(ms).toISOString().slice(0, 10);
}

function decodeTickerExpiry(ticker: string, productCode: string): { label: string; sortKey: string } | null {
  const suffix = ticker.startsWith(productCode) ? ticker.slice(productCode.length) : ticker;
  const match = suffix.match(/([FGHJKMNQUVXZ])(\d{1,2})$/);
  if (!match) return null;
  const month = FUTURES_MONTH_CODES[match[1]];
  const yearToken = match[2];
  const nowYear = new Date().getUTCFullYear();
  let year = yearToken.length === 2
    ? 2000 + Number(yearToken)
    : Math.floor(nowYear / 10) * 10 + Number(yearToken);
  if (year < nowYear - 1) year += 10;
  const mm = String(month).padStart(2, '0');
  return { label: `${year}-${mm}`, sortKey: `${year}-${mm}-01` };
}

function snapshotTicker(row: any): string {
  return String(row?.ticker ?? row?.details?.ticker ?? row?.symbol ?? '');
}

function snapshotProductCode(row: any): string {
  return String(row?.product_code ?? row?.details?.product_code ?? '');
}

function isOutrightTicker(ticker: string, productCode: string): boolean {
  return new RegExp(`^${productCode}[FGHJKMNQUVXZ]\\d{1,2}$`).test(ticker);
}

function snapshotExpiry(row: any, productCode: string): { label: string; sortKey: string } | null {
  const explicit = String(row?.last_trade_date ?? row?.settlement_date ?? row?.details?.settlement_date ?? '').slice(0, 10);
  if (explicit) return { label: explicit.slice(0, 7), sortKey: explicit };
  const detailsDate = dateFromEpoch(row?.details?.settlement_date);
  if (detailsDate) return { label: detailsDate.slice(0, 7), sortKey: detailsDate };
  return decodeTickerExpiry(snapshotTicker(row), productCode);
}

function snapshotAsOf(row: any): string {
  return String(row?.session_end_date ?? '').slice(0, 10)
    || dateFromEpoch(row?.last_trade?.last_updated)
    || dateFromEpoch(row?.last_minute?.last_updated)
    || yesterdayUtcDate();
}

function snapshotPrice(row: any): number {
  const session = row?.session ?? {};
  for (const value of [session.settlement_price, session.close, session.previous_settlement, row?.last_trade?.price, row?.last_minute?.close, row?.price]) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return NaN;
}

export interface MassiveContract {
  ticker: string;             // e.g. 'CLF26'
  product_code: string;       // 'CL'
  last_trade_date: string;    // 'YYYY-MM-DD'
  first_trade_date?: string;
  days_to_maturity?: number;
  active: boolean;
}

export interface MassiveFrontMonth {
  ticker: string;
  productCode: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  asOf: string;
}

export interface MassiveBar {
  date: string;      // 'YYYY-MM-DD'
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

type SnapshotCurveCandidate = {
  row: any;
  expiry: { label: string; sortKey: string } | null;
  price: number;
};

/**
 * List active contracts for a futures product code, sorted by expiry ascending.
 * One API call.
 */
export async function listActiveContracts(
  productCode: string,
  asOfDate: string,           // 'YYYY-MM-DD'
  limit = 250,
): Promise<MassiveContract[]> {
  const json = await get('/futures/v1/contracts', {
    product_code: productCode,
    type: 'single',
    active: true,
    date: asOfDate,
    limit,
    sort: 'ticker',
  });
  const arr = json?.results;
  if (!Array.isArray(arr)) return [];
  return arr
    // Skip spread/combo contracts — we only want outright monthly singles.
    .filter((c: any) => c?.ticker && c?.last_trade_date && (c.type ?? 'single') === 'single' && isOutrightTicker(String(c.ticker), productCode))
    .map((c: any) => ({
      ticker: String(c.ticker),
      product_code: String(c.product_code ?? productCode),
      last_trade_date: String(c.last_trade_date),
      first_trade_date: c.first_trade_date ? String(c.first_trade_date) : undefined,
      days_to_maturity: typeof c.days_to_maturity === 'number' ? c.days_to_maturity : undefined,
      active: c.active !== false,
    }))
    // Sort chronologically client-side (Massive's `sort=ticker` is alphabetic).
    .sort((a, b) => a.last_trade_date.localeCompare(b.last_trade_date));
}

/**
 * Fetch the settlement close for a contract on a specific date.
 * Returns null if no bar exists for that date (weekends, holidays).
 */
export async function fetchContractDailyClose(
  ticker: string,
  date: string,               // 'YYYY-MM-DD'
): Promise<number | null> {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const json = await get(`/futures/v1/aggs/${encodeURIComponent(ticker)}`, {
    resolution: '1session',
    'window_start.gte': start.toISOString().slice(0, 10),
    'window_start.lte': date,
    sort: 'window_start.desc',
    limit: 10,
  });
  const rows = Array.isArray(json?.results) ? json.results : [];
  for (const bar of rows) {
    const close = Number(bar?.settlement_price) > 0 ? Number(bar.settlement_price) : Number(bar?.close);
    if (Number.isFinite(close) && close > 0) return close;
  }
  return null;
}

/** Most recent business-day-ish date (yesterday in UTC); we'll let Massive return null if it's a holiday. */
export function yesterdayUtcDate(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Front-month snapshot for a product. Starter tier exposes /snapshot which
 * returns ticker + last session close + change + volume in a single call.
 * Falls back to the /contracts + /aggs 5-day walkback if snapshot is empty
 * (e.g. brand-new product, or a transient upstream gap).
 */
export async function fetchMassiveFrontMonth(
  productCode: string,
): Promise<MassiveFrontMonth | null> {
  // 1) Fast path: /snapshot (1 call).
  const snap = await get('/futures/v1/snapshot', {
    product_code: productCode,
    sort: 'ticker.asc',
    limit: 24,
  });
  const row = (Array.isArray(snap?.results) ? snap.results : [])
    .filter((r: any) => {
      const ticker = snapshotTicker(r);
      return ticker && snapshotProductCode(r) === productCode && isOutrightTicker(ticker, productCode);
    })
    .map((r: any): SnapshotCurveCandidate => ({ row: r, expiry: snapshotExpiry(r, productCode), price: snapshotPrice(r) }))
    .filter((r: SnapshotCurveCandidate) => r.expiry && Number.isFinite(r.price) && r.price > 0)
    .sort((a: SnapshotCurveCandidate, b: SnapshotCurveCandidate) => a.expiry!.sortKey.localeCompare(b.expiry!.sortKey))[0]?.row ?? null;
  if (row) {
    const session = row.session ?? {};
    const price = snapshotPrice(row);
    if (Number.isFinite(price) && price > 0) {
      const change = Number(session.change ?? session.price_change ?? 0);
      const changePercent = Number(
        session.change_percent ?? session.changePercent ?? session.price_change_percent ?? 0,
      );
      const volume = typeof session.volume === 'number' ? session.volume : undefined;
      const ticker = snapshotTicker(row);
      const asOf = String(
        snapshotAsOf(row),
      ).slice(0, 10);
      return {
        ticker,
        productCode,
        price: +price.toFixed(4),
        change: Number.isFinite(change) ? +change.toFixed(4) : 0,
        changePercent: Number.isFinite(changePercent) ? +changePercent.toFixed(4) : 0,
        volume,
        asOf,
      };
    }
  }

  // 2) Fallback: walk back up to 5 days via /contracts + /aggs.
  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const d = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000);
    const asOf = d.toISOString().slice(0, 10);

    // Fetch a wider window because Massive's API can't sort by expiry —
    // we need to pull several and pick the earliest client-side.
    const contracts = await listActiveContracts(productCode, asOf, 250);
    const front = contracts[0];
    if (!front) continue;

    const close = await fetchContractDailyClose(front.ticker, asOf);
    if (close == null) continue;

    return {
      ticker: front.ticker,
      productCode,
      price: +close.toFixed(4),
      change: 0,
      changePercent: 0,
      asOf,
    };
  }
  return null;
}

/**
 * Daily OHLC bars for a specific ticker between two dates (inclusive).
 * Used for chart history. Empty array on failure.
 */
export async function fetchMassiveDailyBars(
  ticker: string,
  fromDate: string,
  toDate: string,
): Promise<MassiveBar[]> {
  const json = await get(`/futures/v1/aggs/${encodeURIComponent(ticker)}`, {
    resolution: '1session',
    'window_start.gte': fromDate,
    'window_start.lte': toDate,
    'sort': 'window_start.asc',
    limit: 5000,
  });
  const arr = json?.results;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((b: any) => {
      // window_start is a nanosecond Unix timestamp; session_end_date is the
      // human trading date.
      const dateStr = String(b.session_end_date || '').slice(0, 10) ||
        (typeof b.window_start === 'number'
          ? new Date(b.window_start / 1_000_000).toISOString().slice(0, 10)
          : '');
      return {
        date: dateStr,
        open: Number(b.open),
        high: Number(b.high),
        low: Number(b.low),
        close: Number(b.settlement_price ?? b.close),
        volume: typeof b.volume === 'number' ? b.volume : undefined,
      } as MassiveBar;
    })
    .filter((b) => b.date && Number.isFinite(b.close) && b.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Resolve the current front-month ticker for a product (one API call), then
 * fetch its daily bars. Convenience wrapper for chart-history flows.
 */
export async function fetchMassiveFrontMonthBars(
  productCode: string,
  fromDate: string,
  toDate: string,
): Promise<MassiveBar[]> {
  const fm = await fetchMassiveFrontMonth(productCode);
  if (!fm) return [];
  return await fetchMassiveDailyBars(fm.ticker, fromDate, toDate);
}

/** Build a forward curve of up to N contracts for a product. Returns the date used for settlements. */
export async function fetchMassiveCurve(
  productCode: string,
  monthsAhead: number,
): Promise<{ asOf: string; curve: { symbol: string; expiry: string; monthIdx: number; price: number }[] }> {
  // Fast path (Starter): /snapshot returns the whole strip with settlements
  // in a single call. Order by last_trade_date so [0] is front-month.
  const snap = await get('/futures/v1/snapshot', {
    product_code: productCode,
    sort: 'ticker.asc',
    limit: monthsAhead + 4,
  });
  const rows = Array.isArray(snap?.results) ? snap.results : [];
  if (rows.length > 0) {
    let asOf = yesterdayUtcDate();
    const curve = (rows as any[])
      .filter((r: any) => {
        const ticker = snapshotTicker(r);
        return ticker && snapshotProductCode(r) === productCode && isOutrightTicker(ticker, productCode);
      })
      .map((r: any): SnapshotCurveCandidate => ({ row: r, expiry: snapshotExpiry(r, productCode), price: snapshotPrice(r) }))
      .filter((r: SnapshotCurveCandidate) => r.expiry && Number.isFinite(r.price) && r.price > 0)
      .sort((a: SnapshotCurveCandidate, b: SnapshotCurveCandidate) => a.expiry!.sortKey.localeCompare(b.expiry!.sortKey))
      .slice(0, monthsAhead)
      .map((r: SnapshotCurveCandidate, i: number) => {
        const rowAsOf = snapshotAsOf(r.row);
        if (rowAsOf && rowAsOf < asOf) asOf = rowAsOf;
        if (i === 0 && rowAsOf) asOf = rowAsOf;
        return {
          symbol: snapshotTicker(r.row),
          expiry: r.expiry!.label,
          monthIdx: i + 1,
          price: +r.price.toFixed(4),
        };
      })
      .filter((p): p is { symbol: string; expiry: string; monthIdx: number; price: number } =>
        typeof p.price === 'number' && p.price > 0,
      );
    if (curve.length >= 3) return { asOf, curve };
  }

  // Fallback: walk back up to 5 prior business days via /contracts + /aggs.
  for (let dayOffset = 1; dayOffset <= 5; dayOffset++) {
    const d = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000);
    const asOf = d.toISOString().slice(0, 10);

    const contracts = await listActiveContracts(productCode, asOf, 250);
    if (contracts.length === 0) continue;

    const slice = contracts.slice(0, monthsAhead);
    const prices = await Promise.all(slice.map((c) => fetchContractDailyClose(c.ticker, asOf)));

    const curve = slice
      .map((c, i) => ({
        symbol: c.ticker,
        expiry: c.last_trade_date.slice(0, 7),    // YYYY-MM
        monthIdx: i + 1,
        price: prices[i] as number | null,
      }))
      .filter((p): p is { symbol: string; expiry: string; monthIdx: number; price: number } =>
        typeof p.price === 'number' && p.price > 0,
      )
      .map((p) => ({ ...p, price: +p.price.toFixed(4) }));

    if (curve.length >= 3) return { asOf, curve };
  }
  return { asOf: yesterdayUtcDate(), curve: [] };
}
