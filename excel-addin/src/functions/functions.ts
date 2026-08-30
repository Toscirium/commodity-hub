/**
 * Commodity Hub custom functions for Excel.
 *
 * Registered under the CH namespace, so in a cell: =CH.PRICE("Corn Futures")
 *
 * Unit conversion and hedge maths are imported from the main app
 * (src/utils/commodityUnits.ts, src/utils/hedgeMath.ts) rather than copied.
 * Those modules are pure TypeScript with no browser or React dependencies,
 * and the numbers they produce — commodity-specific bushel weights, contract
 * sizes — must not be allowed to drift between the app and this add-in.
 *
 * Every function returns a real Excel error rather than a silent 0 or #VALUE!
 * when something is wrong, because a wrong number in a hedging spreadsheet is
 * far more dangerous than a visible error.
 */
import {
  convertFuturesQuote,
  availableUnits,
  unitLabel,
  type PriceUnit,
} from '../../../src/utils/commodityUnits';
import {
  contractSizeInTonnes,
  futuresLotsToPhysical,
  type PhysicalUnit,
} from '../../../src/utils/hedgeMath';
import { fetchPrice, fetchCot, fetchHistory, ApiError } from '../shared/api';

/* global CustomFunctions */

/** Wraps a thrown error into the Excel error Excel actually understands. */
function toExcelError(err: unknown): never {
  const message = err instanceof Error ? err.message : 'Unexpected error';
  const code = err instanceof ApiError ? err.code : undefined;
  // #N/A reads as "this value isn't available", which is the honest signal for
  // missing data; genuine bad input is #VALUE!.
  const type =
    code === 'no_key' || code === 'api_key_required' || code === 'invalid_api_key'
      ? CustomFunctions.ErrorCode.notAvailable
      : code === 'bad_input'
        ? CustomFunctions.ErrorCode.invalidValue
        : CustomFunctions.ErrorCode.notAvailable;
  throw new CustomFunctions.Error(type, message);
}

function badInput(message: string): never {
  throw new CustomFunctions.Error(CustomFunctions.ErrorCode.invalidValue, message);
}

function parseUnit(raw: string | null | undefined, commodity: string): PriceUnit {
  const wanted = (raw ?? 'native').trim();
  const normalized = wanted.toLowerCase().replace(/\s/g, '');
  const map: Record<string, PriceUnit> = {
    native: 'native', raw: 'native', asquoted: 'native',
    'usd/bu': 'USD/bu', '$/bu': 'USD/bu', usdbu: 'USD/bu',
    'usd/t': 'USD/t', '$/t': 'USD/t', usdt: 'USD/t', 'usd/tonne': 'USD/t',
    'eur/t': 'EUR/t', 'eurt': 'EUR/t', 'eur/tonne': 'EUR/t',
  };
  const unit = map[normalized];
  if (!unit) {
    badInput(`Unknown unit "${wanted}". Use native, USD/bu, USD/t or EUR/t.`);
  }
  if (!availableUnits(commodity).includes(unit)) {
    badInput(`${commodity} cannot be expressed in ${unitLabel(unit, commodity)}.`);
  }
  return unit;
}

/**
 * Current price for a commodity, in its native exchange quote.
 * @customfunction PRICE
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @returns Latest price in the exchange's own quote convention.
 */
export async function price(commodity: string): Promise<number> {
  try {
    return await fetchPrice(commodity);
  } catch (err) {
    return toExcelError(err);
  }
}

/**
 * Current price converted into a chosen unit.
 * Note CBOT grains quote in CENTS per bushel — "USD/t" restates that properly.
 * @customfunction PRICE_IN
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param unit One of native, USD/bu, USD/t, EUR/t.
 * @param eurRate Optional USD to EUR rate; required for EUR/t.
 * @returns Price expressed in the requested unit.
 */
export async function priceIn(commodity: string, unit: string, eurRate?: number): Promise<number> {
  try {
    const target = parseUnit(unit, commodity);
    if (target === 'EUR/t' && (!eurRate || !Number.isFinite(eurRate))) {
      badInput('EUR/t needs a USD→EUR rate as the third argument.');
    }
    const native = await fetchPrice(commodity);
    const converted = convertFuturesQuote(commodity, native, target, eurRate);
    if (converted == null) {
      badInput(`Cannot convert ${commodity} to ${unitLabel(target, commodity)}.`);
    }
    return converted;
  } catch (err) {
    return toExcelError(err);
  }
}

/**
 * Basis: your cash price minus the futures price, both in the same unit.
 * This is the calculation a raw subtraction gets wrong — futures are restated
 * into your unit before subtracting.
 * @customfunction BASIS
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param cashPrice Your local cash price.
 * @param unit Unit your cash price is in: native, USD/bu, USD/t, EUR/t.
 * @param eurRate Optional USD to EUR rate; required for EUR/t.
 * @returns Basis in the same unit as your cash price.
 */
export async function basis(
  commodity: string,
  cashPrice: number,
  unit: string,
  eurRate?: number,
): Promise<number> {
  try {
    if (!Number.isFinite(cashPrice)) badInput('Cash price must be a number.');
    const target = parseUnit(unit, commodity);
    if (target === 'EUR/t' && (!eurRate || !Number.isFinite(eurRate))) {
      badInput('EUR/t needs a USD→EUR rate as the fourth argument.');
    }
    const native = await fetchPrice(commodity);
    const converted = convertFuturesQuote(commodity, native, target, eurRate);
    if (converted == null) {
      badInput(`Cannot convert ${commodity} to ${unitLabel(target, commodity)}.`);
    }
    return cashPrice - converted;
  } catch (err) {
    return toExcelError(err);
  }
}

/**
 * Converts a price you already have between commodity units — no API call.
 * Useful for restating a quote sheet without pulling live data.
 * @customfunction CONVERT
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param nativeQuote A price in the exchange's native quote.
 * @param unit Target unit: native, USD/bu, USD/t, EUR/t.
 * @param eurRate Optional USD to EUR rate; required for EUR/t.
 * @returns The price restated in the target unit.
 */
export function convert(
  commodity: string,
  nativeQuote: number,
  unit: string,
  eurRate?: number,
): number {
  if (!Number.isFinite(nativeQuote)) badInput('Quote must be a number.');
  const target = parseUnit(unit, commodity);
  if (target === 'EUR/t' && (!eurRate || !Number.isFinite(eurRate))) {
    badInput('EUR/t needs a USD→EUR rate as the fourth argument.');
  }
  const converted = convertFuturesQuote(commodity, nativeQuote, target, eurRate);
  if (converted == null) badInput(`Cannot convert ${commodity} to ${unitLabel(target, commodity)}.`);
  return converted;
}

/**
 * Latest CFTC Commitment of Traders figure.
 * @customfunction COT
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param field One of net_position, managed_money_long, managed_money_short, commercials_long, commercials_short, open_interest.
 * @returns The latest weekly value for that field.
 */
export async function cot(commodity: string, field: string): Promise<number> {
  try {
    const allowed = [
      'net_position', 'managed_money_long', 'managed_money_short',
      'commercials_long', 'commercials_short', 'open_interest',
    ] as const;
    const key = (field ?? '').trim().toLowerCase().replace(/[\s-]/g, '_');
    if (!(allowed as readonly string[]).includes(key)) {
      badInput(`Unknown field "${field}". Use one of: ${allowed.join(', ')}.`);
    }
    const rows = await fetchCot(commodity, 1);
    const value = (rows[0] as unknown as Record<string, unknown>)[key];
    if (typeof value !== 'number') badInput(`No ${key} in the latest report for ${commodity}.`);
    return value;
  } catch (err) {
    return toExcelError(err);
  }
}

/**
 * Date of the latest COT report held for a commodity.
 * @customfunction COT_DATE
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @returns Report date as text (YYYY-MM-DD).
 */
export async function cotDate(commodity: string): Promise<string> {
  try {
    const rows = await fetchCot(commodity, 1);
    return rows[0].report_date ?? '';
  } catch (err) {
    return toExcelError(err);
  }
}

/**
 * Historical prices as a spilled two-column range: date and close.
 * @customfunction HISTORY
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param timeframe One of 1d, 1m, 3m, 6m, 1y, 2y.
 * @returns Two columns — date, close — one row per observation.
 */
export async function history(commodity: string, timeframe: string): Promise<(string | number)[][]> {
  try {
    const tf = (timeframe ?? '').trim().toLowerCase();
    const valid = ['1d', '1m', '3m', '6m', '1y', '2y'];
    if (!valid.includes(tf)) badInput(`Timeframe must be one of: ${valid.join(', ')}.`);
    const points = await fetchHistory(commodity, tf);
    const rows: (string | number)[][] = [['Date', 'Close']];
    for (const p of points) {
      const date = p.date ?? p.time ?? '';
      const close = p.close ?? p.price ?? p.value;
      if (typeof close === 'number') rows.push([String(date), close]);
    }
    if (rows.length === 1) badInput(`No usable history returned for ${commodity}.`);
    return rows;
  } catch (err) {
    return toExcelError(err);
  }
}

/**
 * Size of one futures contract in metric tonnes. No API call.
 * A corn lot is 127.01 t and a wheat lot 136.08 t despite both being 5,000 bushels.
 * @customfunction CONTRACT_TONNES
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @returns Metric tonnes per contract.
 */
export function contractTonnes(commodity: string): number {
  const t = contractSizeInTonnes(commodity);
  if (t == null) badInput(`No contract size known for "${commodity}".`);
  return t;
}

/**
 * How many futures lots hedge a given physical quantity. No API call.
 * @customfunction LOTS_FOR
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param quantity Physical quantity to hedge.
 * @param quantityUnit One of tonne, bushel, short-ton.
 * @returns Lots required, as a decimal — round to whole contracts yourself.
 */
export function lotsFor(commodity: string, quantity: number, quantityUnit: string): number {
  if (!Number.isFinite(quantity) || quantity <= 0) badInput('Quantity must be a positive number.');
  const unit = (quantityUnit ?? 'tonne').trim().toLowerCase();
  const map: Record<string, PhysicalUnit> = {
    tonne: 'tonne', tonnes: 'tonne', t: 'tonne', mt: 'tonne',
    bushel: 'bushel', bushels: 'bushel', bu: 'bushel',
    'short-ton': 'short-ton', shortton: 'short-ton', st: 'short-ton',
  };
  const target = map[unit];
  if (!target) badInput(`Unknown quantity unit "${quantityUnit}". Use tonne, bushel or short-ton.`);
  const perLot = futuresLotsToPhysical(commodity, 1, target);
  if (perLot == null || perLot === 0) badInput(`No contract size known for "${commodity}".`);
  return quantity / perLot;
}

/**
 * Physical quantity represented by a number of futures lots. No API call.
 * @customfunction LOTS_TO_QTY
 * @param commodity Commodity name, e.g. "Corn Futures".
 * @param lots Number of contracts.
 * @param quantityUnit One of tonne, bushel, short-ton.
 * @returns The equivalent physical quantity.
 */
export function lotsToQty(commodity: string, lots: number, quantityUnit: string): number {
  if (!Number.isFinite(lots)) badInput('Lots must be a number.');
  const unit = (quantityUnit ?? 'tonne').trim().toLowerCase();
  const map: Record<string, PhysicalUnit> = {
    tonne: 'tonne', tonnes: 'tonne', t: 'tonne', mt: 'tonne',
    bushel: 'bushel', bushels: 'bushel', bu: 'bushel',
    'short-ton': 'short-ton', shortton: 'short-ton', st: 'short-ton',
  };
  const target = map[unit];
  if (!target) badInput(`Unknown quantity unit "${quantityUnit}". Use tonne, bushel or short-ton.`);
  const qty = futuresLotsToPhysical(commodity, lots, target);
  if (qty == null) badInput(`No contract size known for "${commodity}".`);
  return qty;
}
