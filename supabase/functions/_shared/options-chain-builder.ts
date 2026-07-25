// Shared Databento chain-building logic for fetch-options-chain (on-demand,
// user-facing) and warm-options-chain (cron-driven cache warmer). Factored
// out so both stay in sync rather than duplicating the definition/statistics
// join logic.
//
// Databento is raw tick/reference data, not a pre-built "chain" endpoint,
// so this joins two schemas client-side:
//   1. `definition` (stype_in=parent, symbols=`${optionsRoot}.OPT`) — the
//      universe of live option instruments for the product root: strike,
//      expiration, call/put, instrument_id.
//   2. `statistics` (stype_in=instrument_id) — settlement price, open
//      interest, volume, and (if CME publishes it) implied vol/delta, for
//      the specific instruments in the selected expiration.
//
// Verified live against real Databento responses (2026-07-25): CME does not
// publish IV/delta for these products via this statistics feed (callIV/
// putIV always come back null — the frontend falls back to its own
// Black-76 solver), and `encoding: 'json'` returns newline-delimited JSON.

const DATABENTO_BASE = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3';

// `product` is the futures root (same codes as MASSIVE_PRODUCT_CODES in
// commodity-mappings.ts, used for the underlying futures price below) but
// CME lists options on a *separate* product root — Databento's parent
// symbology ("Could not resolve smart symbols: CL.OPT") confirmed
// `${product}.OPT` doesn't resolve. `optionsRoot` is the actual CME options
// root (verified against a live Databento definition call), same codes the
// old CME-scraper's PRODUCT_IDS used pre-Databento.
export const PRODUCT_ROOTS: Record<string, { optionsRoot: string; label: string }> = {
  CL: { optionsRoot: 'LO', label: 'WTI Crude Oil Options' },
  NG: { optionsRoot: 'LNE', label: 'Natural Gas Options' },
  GC: { optionsRoot: 'OG', label: 'Gold Options' },
  ZC: { optionsRoot: 'OZC', label: 'Corn Options' },
  ZS: { optionsRoot: 'OZS', label: 'Soybean Options' },
};

export type Expiration = { code: string; label: string; expirationDate?: string };
export type ChainRow = {
  strike: number;
  callSettle: number | null;
  callVolume: number | null;
  callOpenInterest: number | null;
  putSettle: number | null;
  putVolume: number | null;
  putOpenInterest: number | null;
  callIV: number | null;
  putIV: number | null;
};
export type ChainPayload = {
  product: string;
  productLabel: string;
  expirations: Expiration[];
  expiration: string;
  expirationDate: string | null;
  underlying: number | null;
  tradeDate: string | null;
  rows: ChainRow[];
};

const StatType = { SETTLEMENT: 3, CLEARED_VOLUME: 6, OPEN_INTEREST: 9, VOLATILITY: 14, DELTA: 15 } as const;

// DBN's UNDEF_PRICE/UNDEF_STAT_QUANTITY/UNDEF_TIMESTAMP sentinels are near
// i64::MAX. JS loses precision on integers that large, so this is a
// magnitude check rather than an exact match.
const I64_SENTINEL = 9_223_372_036_854_770_000;

/** Fixed-price DBN field: 1 unit = 1e-9. */
function fixedPrice(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= I64_SENTINEL) return null;
  return n / 1e9;
}

function safeQuantity(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n >= I64_SENTINEL) return null;
  return n;
}

function nanosToMs(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n >= I64_SENTINEL) return null;
  return n / 1e6;
}

/** Parses a Databento JSON-encoded timeseries response (newline-delimited JSON). */
function parseRecords(text: string): Record<string, unknown>[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((r): r is Record<string, unknown> => !!r);
}

/** Reads a field from the top level of a record, or from a nested `hd` (header). */
function fieldNum(rec: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (rec[k] !== undefined) return rec[k];
  }
  const hd = rec.hd as Record<string, unknown> | undefined;
  if (hd) {
    for (const k of keys) {
      if (hd[k] !== undefined) return hd[k];
    }
  }
  return undefined;
}

async function databentoGetRange(
  apiKey: string,
  params: {
    schema: 'definition' | 'statistics';
    symbols: string;
    stypeIn: 'parent' | 'instrument_id';
    start: string;
    end: string;
  },
): Promise<Record<string, unknown>[]> {
  const body = new URLSearchParams({
    dataset: DATASET,
    schema: params.schema,
    symbols: params.symbols,
    stype_in: params.stypeIn,
    stype_out: 'instrument_id',
    start: params.start,
    end: params.end,
    encoding: 'json',
  });
  const res = await fetch(`${DATABENTO_BASE}/timeseries.get_range`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${apiKey}:`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Databento ${params.schema} request failed: ${res.status} ${detail.slice(0, 300)}`);
  }
  return parseRecords(await res.text());
}

interface OptionDef {
  instrumentId: string;
  strike: number;
  right: 'C' | 'P';
  expirationMs: number;
}

async function fetchDefinitions(apiKey: string, root: string, start: string, end: string): Promise<OptionDef[]> {
  const recs = await databentoGetRange(apiKey, {
    schema: 'definition',
    symbols: `${root}.OPT`,
    stypeIn: 'parent',
    start,
    end,
  });
  const byId = new Map<string, OptionDef & { tsRecv: number }>();
  for (const rec of recs) {
    const cls = String(rec.instrument_class ?? '');
    if (cls !== 'C' && cls !== 'P') continue; // skip spreads/combos
    const instrumentId = String(fieldNum(rec, 'instrument_id') ?? '');
    const strike = fixedPrice(rec.strike_price);
    const expirationMs = nanosToMs(rec.expiration);
    if (!instrumentId || strike == null || expirationMs == null) continue;
    const tsRecv = Number(fieldNum(rec, 'ts_recv') ?? 0);
    const existing = byId.get(instrumentId);
    if (existing && existing.tsRecv >= tsRecv) continue; // keep latest definition per instrument
    byId.set(instrumentId, { instrumentId, strike, right: cls as 'C' | 'P', expirationMs, tsRecv });
  }
  return [...byId.values()];
}

interface OptionStats {
  settle: number | null;
  volume: number | null;
  openInterest: number | null;
  iv: number | null;
}

async function fetchStatistics(
  apiKey: string,
  instrumentIds: string[],
  start: string,
  end: string,
): Promise<Map<string, OptionStats>> {
  const out = new Map<string, OptionStats>();
  if (instrumentIds.length === 0) return out;
  // Databento allows up to 2,000 symbols/request; a single expiration's
  // strikes comfortably fit in one call.
  const recs = await databentoGetRange(apiKey, {
    schema: 'statistics',
    symbols: instrumentIds.join(','),
    stypeIn: 'instrument_id',
    start,
    end,
  });
  const latestPerType = new Map<string, Map<number, number>>();
  for (const rec of recs) {
    const instrumentId = String(fieldNum(rec, 'instrument_id') ?? '');
    if (!instrumentId) continue;
    const statType = Number(rec.stat_type);
    const tsRecv = Number(fieldNum(rec, 'ts_recv') ?? 0);

    if (!out.has(instrumentId)) {
      out.set(instrumentId, { settle: null, volume: null, openInterest: null, iv: null });
    }
    if (!latestPerType.has(instrumentId)) latestPerType.set(instrumentId, new Map());
    const seenAt = latestPerType.get(instrumentId)!;
    const prevTs = seenAt.get(statType) ?? -1;
    if (tsRecv < prevTs) continue; // keep only the most recent record per stat type
    seenAt.set(statType, tsRecv);

    const entry = out.get(instrumentId)!;
    switch (statType) {
      case StatType.SETTLEMENT: entry.settle = fixedPrice(rec.price); break;
      case StatType.OPEN_INTEREST: entry.openInterest = safeQuantity(rec.quantity); break;
      case StatType.CLEARED_VOLUME: entry.volume = safeQuantity(rec.quantity); break;
      case StatType.VOLATILITY: entry.iv = fixedPrice(rec.price); break;
    }
  }
  return out;
}

export class NoLiveInstrumentsError extends Error {
  constructor(public product: string) {
    super(`Databento returned no live option instruments for ${product}`);
  }
}

/**
 * Builds a full options-chain payload for one product/expiration by joining
 * Databento's definition + statistics schemas, plus the app's own
 * Massive Futures front-month price for the underlying.
 *
 * `definition` is a full daily universe snapshot (every live strike ×
 * expiration for the root — thousands of instruments for a liquid product),
 * and each extra day in the range re-emits ~the same universe again. A
 * 10-day window blew the edge function's own compute budget
 * (WORKER_RESOURCE_LIMIT); even a 2-day window made Databento's own backend
 * time out (a real 504 from hist.databento.com, not us) for Gold specifically
 * — its universe is apparently the densest of the five products, and even a
 * successful cold load can take 60-140s+ purely on Databento's side. Default
 * to the narrowest useful window (1 day) and only widen — first to cover a
 * weekend, then further for holidays — if that comes back empty.
 */
export async function buildOptionsChainPayload(
  apiKey: string,
  product: string,
  fetchMassiveFrontMonth: (code: string) => Promise<{ price: number } | null>,
  expiration?: string,
  onWarn?: (message: string, err: unknown) => void,
): Promise<ChainPayload> {
  const meta = PRODUCT_ROOTS[product];
  if (!meta) throw new Error(`Unsupported product: ${product}`);

  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);
  const windowStart = (days: number) => new Date(end.getTime() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let lookbackDays = 1;
  let defs = await fetchDefinitions(apiKey, meta.optionsRoot, windowStart(lookbackDays), endStr);
  if (defs.length === 0) {
    lookbackDays = 3;
    defs = await fetchDefinitions(apiKey, meta.optionsRoot, windowStart(lookbackDays), endStr);
  }
  if (defs.length === 0) {
    lookbackDays = 8;
    defs = await fetchDefinitions(apiKey, meta.optionsRoot, windowStart(lookbackDays), endStr);
  }
  if (defs.length === 0) throw new NoLiveInstrumentsError(product);
  const startStr = windowStart(lookbackDays);

  // Group by expiration date.
  const byExpiration = new Map<string, OptionDef[]>();
  for (const d of defs) {
    const code = new Date(d.expirationMs).toISOString().slice(0, 10);
    const arr = byExpiration.get(code) ?? [];
    arr.push(d);
    byExpiration.set(code, arr);
  }
  const sortedCodes = [...byExpiration.keys()].sort();
  const expirations: Expiration[] = sortedCodes.map((code) => ({
    code,
    label: new Date(code).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    expirationDate: code,
  }));
  const expCode = expiration && byExpiration.has(expiration) ? expiration : sortedCodes[0];
  const chainDefs = byExpiration.get(expCode) ?? [];

  const stats = await fetchStatistics(apiKey, chainDefs.map((d) => d.instrumentId), startStr, endStr);

  const byStrike = new Map<number, ChainRow>();
  for (const d of chainDefs) {
    let row = byStrike.get(d.strike);
    if (!row) {
      row = {
        strike: d.strike,
        callSettle: null, callVolume: null, callOpenInterest: null, callIV: null,
        putSettle: null, putVolume: null, putOpenInterest: null, putIV: null,
      };
      byStrike.set(d.strike, row);
    }
    const s = stats.get(d.instrumentId);
    if (d.right === 'C') {
      row.callSettle = s?.settle ?? null;
      row.callVolume = s?.volume ?? null;
      row.callOpenInterest = s?.openInterest ?? null;
      row.callIV = s?.iv ?? null;
    } else {
      row.putSettle = s?.settle ?? null;
      row.putVolume = s?.volume ?? null;
      row.putOpenInterest = s?.openInterest ?? null;
      row.putIV = s?.iv ?? null;
    }
  }
  const rows = [...byStrike.values()].sort((a, b) => a.strike - b.strike);

  // Reuse the app's existing Massive Futures front-month price rather than
  // spending an extra Databento query on the outright future.
  let underlying: number | null = null;
  try {
    const fm = await fetchMassiveFrontMonth(product);
    underlying = fm?.price ?? null;
  } catch (err) {
    onWarn?.(`Massive front-month lookup failed for ${product}`, err);
  }

  return {
    product,
    productLabel: meta.label,
    expirations,
    expiration: expCode,
    expirationDate: expCode,
    underlying,
    tradeDate: endStr,
    rows,
  };
}
