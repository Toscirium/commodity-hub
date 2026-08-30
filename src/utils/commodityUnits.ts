/**
 * Unit and currency conversion for commodity futures quotes.
 *
 * Exists because CBOT/CME quote conventions vary per commodity and are NOT
 * normalized anywhere in the price pipeline — verified against real stored
 * values in commodity_price_snapshots (2026-08-30):
 *
 *   Corn           550.75   -> cents per bushel
 *   Wheat          797.50   -> cents per bushel
 *   Soybeans      1276.25   -> cents per bushel
 *   Soybean Meal   350.40   -> USD per SHORT ton
 *   Soybean Oil     70.95   -> cents per pound
 *
 * Basis (cash minus futures) is only meaningful when both sides are in the
 * same unit and currency. A European trader quotes physical grain in EUR per
 * metric tonne; subtracting that from 550.75 cents/bushel produces a
 * meaningless number. That was a real bug in the first Basis Tracker release.
 *
 * Canonical internal base is USD per metric tonne for weight-quoted
 * commodities; everything converts through it.
 */

export type PriceUnit = 'native' | 'USD/bu' | 'USD/t' | 'EUR/t';

export type QuoteConvention =
  | 'cents/bu'
  | 'USD/short-ton'
  | 'cents/lb'
  | 'USD/cwt'
  | 'other';

export interface CommodityUnitSpec {
  quote: QuoteConvention;
  /** Short human label for the native quote, e.g. "¢/bu". */
  nativeLabel: string;
  /**
   * Bushels per metric tonne — commodity-specific by legal bushel weight, so
   * there is no single correct factor. Corn/sorghum are 56 lb bushels;
   * wheat/soybeans 60 lb; oats 32 lb. Only set for bushel-quoted commodities.
   */
  bushelsPerTonne?: number;
}

// 1 short ton = 0.90718474 t, so 1 t = 1.10231131 short tons.
const SHORT_TONS_PER_TONNE = 1.10231131;
// 1 t = 2204.62262 lb.
const POUNDS_PER_TONNE = 2204.62262;
// 1 cwt = 100 lb.
const CWT_PER_TONNE = POUNDS_PER_TONNE / 100;

export const COMMODITY_UNITS: Record<string, CommodityUnitSpec> = {
  // 56 lb bushel
  'Corn Futures': { quote: 'cents/bu', nativeLabel: '¢/bu', bushelsPerTonne: 39.3683 },
  // 60 lb bushel
  'Wheat Futures': { quote: 'cents/bu', nativeLabel: '¢/bu', bushelsPerTonne: 36.7437 },
  'KC HRW Wheat': { quote: 'cents/bu', nativeLabel: '¢/bu', bushelsPerTonne: 36.7437 },
  'Soybean Futures': { quote: 'cents/bu', nativeLabel: '¢/bu', bushelsPerTonne: 36.7437 },
  // 32 lb bushel
  'Oat Futures': { quote: 'cents/bu', nativeLabel: '¢/bu', bushelsPerTonne: 64.842 },

  'Soybean Meal': { quote: 'USD/short-ton', nativeLabel: '$/short ton' },
  'Soybean Oil': { quote: 'cents/lb', nativeLabel: '¢/lb' },
  'Rough Rice': { quote: 'USD/cwt', nativeLabel: '$/cwt' },
};

/** Commodities we can express per-tonne. Everything else is native-only. */
export const supportsWeightUnits = (commodityName: string): boolean =>
  COMMODITY_UNITS[commodityName] !== undefined;

export const nativeLabelFor = (commodityName: string): string =>
  COMMODITY_UNITS[commodityName]?.nativeLabel ?? 'quote';

/** Native quote -> USD per metric tonne. Null when not weight-convertible. */
export function nativeToUsdPerTonne(commodityName: string, nativeQuote: number): number | null {
  const spec = COMMODITY_UNITS[commodityName];
  if (!spec || !Number.isFinite(nativeQuote)) return null;

  switch (spec.quote) {
    case 'cents/bu': {
      if (!spec.bushelsPerTonne) return null;
      return (nativeQuote / 100) * spec.bushelsPerTonne;
    }
    case 'USD/short-ton':
      return nativeQuote * SHORT_TONS_PER_TONNE;
    case 'cents/lb':
      return (nativeQuote / 100) * POUNDS_PER_TONNE;
    case 'USD/cwt':
      return nativeQuote * CWT_PER_TONNE;
    default:
      return null;
  }
}

/** Native quote -> USD per bushel. Null unless bushel-quoted. */
export function nativeToUsdPerBushel(commodityName: string, nativeQuote: number): number | null {
  const spec = COMMODITY_UNITS[commodityName];
  if (!spec || spec.quote !== 'cents/bu' || !Number.isFinite(nativeQuote)) return null;
  return nativeQuote / 100;
}

/**
 * Convert a native futures quote into the unit the user is quoting their cash
 * price in, so basis is a like-for-like subtraction.
 *
 * `usdToEur` is the USD->EUR rate (as returned by useCurrency's rates.EUR).
 * Returns null when the conversion isn't defined for that commodity — callers
 * must handle that rather than silently showing a wrong number.
 */
export function convertFuturesQuote(
  commodityName: string,
  nativeQuote: number,
  target: PriceUnit,
  usdToEur?: number,
): number | null {
  if (!Number.isFinite(nativeQuote)) return null;
  if (target === 'native') return nativeQuote;

  if (target === 'USD/bu') return nativeToUsdPerBushel(commodityName, nativeQuote);

  const usdPerTonne = nativeToUsdPerTonne(commodityName, nativeQuote);
  if (usdPerTonne == null) return null;
  if (target === 'USD/t') return usdPerTonne;

  if (target === 'EUR/t') {
    if (!Number.isFinite(usdToEur) || !usdToEur) return null;
    return usdPerTonne * usdToEur;
  }
  return null;
}

/** Which units a given commodity can actually be expressed in. */
export function availableUnits(commodityName: string): PriceUnit[] {
  const spec = COMMODITY_UNITS[commodityName];
  if (!spec) return ['native'];
  const units: PriceUnit[] = ['native'];
  if (spec.quote === 'cents/bu') units.push('USD/bu');
  units.push('USD/t', 'EUR/t');
  return units;
}

export const unitLabel = (unit: PriceUnit, commodityName?: string): string => {
  if (unit === 'native') return commodityName ? nativeLabelFor(commodityName) : 'native';
  if (unit === 'USD/bu') return '$/bu';
  if (unit === 'USD/t') return '$/tonne';
  return '€/tonne';
};
