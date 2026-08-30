/**
 * Data API client for the Excel add-in.
 *
 * Talks to the same public REST API documented at commodity-hub.eu/api — no
 * private endpoints, no service-role anything. The user's own `ch_live_...`
 * key is supplied through the task pane and stored in Office's per-user
 * add-in storage, never hardcoded and never passed as a cell argument (a key
 * in a formula would be visible to anyone the workbook is shared with, and
 * would sync into OneDrive/SharePoint with the file).
 */

export const API_BASE = 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/data-api';
const KEY_STORAGE = 'ch_api_key';

/** Office's storage is async and only present inside Office; fall back for tests/dev. */
async function readStoredKey(): Promise<string | null> {
  try {
    const rt = (globalThis as { OfficeRuntime?: { storage?: { getItem(k: string): Promise<string | null> } } }).OfficeRuntime;
    if (rt?.storage) return await rt.storage.getItem(KEY_STORAGE);
  } catch {
    /* fall through */
  }
  try {
    return globalThis.localStorage?.getItem(KEY_STORAGE) ?? null;
  } catch {
    return null;
  }
}

export async function storeKey(key: string): Promise<void> {
  const rt = (globalThis as { OfficeRuntime?: { storage?: { setItem(k: string, v: string): Promise<void> } } }).OfficeRuntime;
  if (rt?.storage) {
    await rt.storage.setItem(KEY_STORAGE, key);
    return;
  }
  globalThis.localStorage?.setItem(KEY_STORAGE, key);
}

export async function clearKey(): Promise<void> {
  const rt = (globalThis as { OfficeRuntime?: { storage?: { removeItem(k: string): Promise<void> } } }).OfficeRuntime;
  if (rt?.storage) {
    await rt.storage.removeItem(KEY_STORAGE);
    return;
  }
  globalThis.localStorage?.removeItem(KEY_STORAGE);
}

export async function hasKey(): Promise<boolean> {
  return !!(await readStoredKey());
}

/**
 * Excel recalculates aggressively — dragging a formula down 200 rows fires 200
 * calls at once. Without this, a single spreadsheet would burn the free tier's
 * 50 requests/day in one paste and hit the 60/min ceiling on Pro. Responses
 * are cached per resource+params; in-flight requests are shared so N identical
 * concurrent calls become one fetch.
 */
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T = unknown>(
  resource: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const key = await readStoredKey();
  if (!key) {
    throw new ApiError('No API key set. Open the Commodity Hub task pane and paste your key.', 'no_key');
  }

  const qs = new URLSearchParams({ resource });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const url = `${API_BASE}?${qs.toString()}`;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value as T;

  const existing = inflight.get(url);
  if (existing) return (await existing) as T;

  const job = (async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = (body as { error?: string }).error;
      throw new ApiError(errorMessage(res.status, code), code);
    }
    const value = (body as { data?: unknown }).data;
    cache.set(url, { at: Date.now(), value });
    return value;
  })();

  inflight.set(url, job);
  try {
    return (await job) as T;
  } finally {
    inflight.delete(url);
  }
}

/** Turns the API's error codes into something a spreadsheet user can act on. */
function errorMessage(status: number, code?: string): string {
  switch (code) {
    case 'api_key_required':
    case 'invalid_api_key':
      return 'API key is missing or invalid — check it in the task pane.';
    case 'rate_limited':
      return 'Rate limit hit (60 requests/minute). Wait a moment and recalculate.';
    case 'trial_daily_limit_exceeded':
      return 'Free tier daily limit reached (50 requests). Upgrade to Pro for no daily cap.';
    case 'premium_required':
      return 'This data needs an active Premium or Pro subscription.';
    case 'pro_required':
      return 'This data needs an active Pro subscription.';
    case 'commodity_not_found':
      return 'Commodity not found — check the spelling against the catalogue.';
    case 'snapshot_not_available':
      return 'No cached analytics for that commodity yet. Open it once in the web app to seed it.';
    default:
      return `Request failed (HTTP ${status}${code ? `: ${code}` : ''}).`;
  }
}

/** Clears cached responses — used by the task pane's "refresh" action. */
export function clearCache(): void {
  cache.clear();
}

export interface PriceRow {
  name?: string;
  symbol?: string;
  price?: number;
  change?: number;
  changePercent?: number;
}

/** Current native-quote price for one commodity. */
export async function fetchPrice(commodity: string): Promise<number> {
  const data = await apiGet<PriceRow | PriceRow[]>('prices', { commodity });
  const row = Array.isArray(data) ? data[0] : data;
  const price = row?.price;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new ApiError(`No price available for "${commodity}".`, 'no_price');
  }
  return price;
}

export interface CotRow {
  commodity?: string;
  report_date?: string;
  managed_money_long?: number;
  managed_money_short?: number;
  commercials_long?: number;
  commercials_short?: number;
  net_position?: number;
  open_interest?: number;
}

export async function fetchCot(commodity: string, limit = 1): Promise<CotRow[]> {
  const data = await apiGet<CotRow[]>('cot', { commodity, limit });
  if (!Array.isArray(data) || data.length === 0) {
    throw new ApiError(`No COT data for "${commodity}".`, 'no_cot');
  }
  return data;
}

export interface ChartPoint {
  date?: string;
  time?: string;
  close?: number;
  price?: number;
  value?: number;
}

export async function fetchHistory(commodity: string, timeframe: string): Promise<ChartPoint[]> {
  const data = await apiGet<ChartPoint[]>('prices', { commodity, timeframe });
  if (!Array.isArray(data) || data.length === 0) {
    throw new ApiError(`No history for "${commodity}" at ${timeframe}.`, 'no_history');
  }
  return data;
}
