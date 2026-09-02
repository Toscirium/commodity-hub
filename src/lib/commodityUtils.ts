/**
 * Utility functions for commodity data formatting
 */

// Commodities that are priced in cents rather than dollars
const CENT_PRICED_COMMODITIES = [
  // Grains (cents per bushel/cwt)
  'Corn Futures',
  'Wheat Futures', 
  'Soybean Futures',
  'Oat Futures',
  'Rough Rice',
  
  // Softs (cents per pound)
  'Coffee',
  'Sugar',
  'Cotton', 
  'Orange Juice'
];

/**
 * Check if a commodity should be displayed in cents
 */
export const isCentPriced = (commodityName: string): boolean => {
  return CENT_PRICED_COMMODITIES.some(name => 
    commodityName.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(commodityName.toLowerCase())
  );
};

/**
 * Per-commodity display unit suffix (e.g. "/lb", "/oz", "/bbl").
 * Returns empty string when no unit is known.
 */
export const getPriceUnit = (commodityName: string): string => {
  if (!commodityName) return '';
  const n = commodityName.toLowerCase();

  // Precious & platinum-group metals → troy ounce
  if (/(gold|silver|platinum|palladium|rhodium)/.test(n)) return '/oz';

  // Energy
  if (/(wti|brent|crude)/.test(n)) return '/bbl';
  if (/natural gas/.test(n)) return '/MMBtu';
  if (/(gasoline|rbob|heating oil|gasoil|diesel)/.test(n)) return '/gal';

  // Grains & oilseeds → bushel
  if (/(corn|wheat|soybean futures|soybeans|oat|rough rice|rice futures)/.test(n)) {
    // Soybean Oil & Meal handled below
    if (!/soybean oil|soybean meal/.test(n)) return '/bu';
  }
  if (/soybean oil/.test(n)) return '/lb';
  if (/soybean meal/.test(n)) return '/ton';

  // Softs
  if (/cocoa/.test(n)) return '/mt';
  if (/(coffee|sugar|cotton|orange juice)/.test(n)) return '/lb';

  // Industrial metals
  if (/copper/.test(n)) return '/lb';

  // Livestock
  if (/(cattle|hogs|lean hog|feeder)/.test(n)) return '/lb';

  // Lumber
  if (/lumber/.test(n)) return '/bd ft';

  // Dairy / eggs
  if (/eggs/.test(n)) return '/doz';
  if (/milk/.test(n)) return '/cwt';
  if (/(cheese|butter)/.test(n)) return '/lb';

  return '';
};

/**
 * Long-form pricing unit shown next to a headline price ("$/barrel"), as
 * opposed to getPriceUnit()'s terse suffix ("/bbl") used inline after a
 * number. Lived inside CommodityCard until the detail page needed the same
 * label in its price header.
 */
export const getPriceUnitLabel = (commodityName: string): string => {
  const lower = commodityName.toLowerCase();
  // Marine fuels (VLSFO, HFO, MGO)
  if (lower.includes('vlsfo') || lower.includes('hfo') || lower.includes('mgo')) return '$/MT';
  if (lower.includes('gasoil') || lower.includes('naphtha')) return '$/tonne';
  // Refined products sold per gallon
  if (
    lower.includes('jet fuel') || lower.includes('ulsd') || lower.includes('diesel') ||
    lower.includes('heating oil') || lower.includes('gasoline') || lower.includes('rbob')
  ) return '$/gallon';
  if (lower.includes('gas storage')) return 'Bcf';
  if (lower.includes('dutch ttf')) return '€/MWh';
  if (lower.includes('lng')) return '$/MMBtu';
  // Crude oils per barrel
  if (
    lower.includes('oil') || lower.includes('crude') || lower.includes('wti') ||
    lower.includes('brent') || lower.includes('tapis') || lower.includes('urals') ||
    lower.includes('canadian select') || lower.includes('opec')
  ) return '$/barrel';
  if (lower.includes('natural gas uk')) return 'GBp/therm';
  if (lower.includes('gas')) return '$/MMBtu';
  if (lower.includes('gold') || lower.includes('silver')) return '$/oz';
  if (lower.includes('corn') || lower.includes('wheat')) return '¢/bushel';
  return '$/unit';
};

/**
 * Currency prefix for a headline price. Most commodities quote in USD; a few
 * European/UK benchmarks don't, and gas storage is a volume, not a price.
 */
export const getPricePrefix = (commodityName: string): string => {
  const lower = commodityName.toLowerCase();
  if (lower.includes('gas storage')) return '';
  if (lower.includes('dutch ttf')) return '€';
  if (lower.includes('natural gas uk')) return '£';
  return '$';
};

/** Headline price formatting: thousands separators above 1,000, else 2dp. */
export const formatHeadlinePrice = (priceValue: number): string => {
  if (priceValue >= 10000) {
    return priceValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  if (priceValue >= 1000) {
    return priceValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return priceValue.toFixed(2);
};

/**
 * Format price with appropriate currency symbol, decimals, and unit suffix.
 * Pass `withUnit=false` for dense numeric layouts (chart axes, CSV exports).
 */
export const formatPrice = (
  price: number,
  commodityName: string,
  decimals: number = 2,
  withUnit: boolean = true,
): string => {
  const base = isCentPriced(commodityName)
    ? `${price.toFixed(decimals)}¢`
    : `$${price.toFixed(decimals)}`;
  return withUnit ? `${base}${getPriceUnit(commodityName)}` : base;
};

/**
 * Get the currency symbol for a commodity
 */
export const getCurrencySymbol = (commodityName: string): string => {
  return isCentPriced(commodityName) ? '¢' : '$';
};

/**
 * Get appropriate decimal places for a commodity based on timeframe
 */
export const getDecimalPlaces = (commodityName: string, timeframe?: string): number => {
  if (isCentPriced(commodityName)) {
    // Cent-priced commodities typically show 1-2 decimal places
    return timeframe === '1d' ? 2 : 1;
  }
  
  // Dollar-priced commodities
  if (commodityName.includes('Gold') || commodityName.includes('Silver') || commodityName.includes('Platinum') || commodityName.includes('Palladium')) {
    return 2; // Precious metals always show 2 decimals
  }
  
  return timeframe === '1d' ? 2 : 0; // Other dollar commodities
};