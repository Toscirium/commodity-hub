import { CommoditySymbol } from './types.ts';

// Catalog sourced exclusively from Massive Futures API as of 2026-07-14.
// OilPriceAPI retired: regional crude blends (Dubai, Oman, Murban, WCS, WTI
// Midland, Mars, LLS, OPEC Basket), LNG hubs (UK NBP, TTF, JKM), refined
// products beyond RBOB/Heating Oil (Jet, ULSD, Gasoil, Naphtha), and marine
// fuels have been removed because Massive covers only CME/CBOT/COMEX/NYMEX.
// Free tier = household names. Premium = specialty variants (HO, RB, PA, etc.).
export const COMMODITY_SYMBOLS: Record<string, CommoditySymbol> = {
  // ============ ENERGY (Massive Futures — NYMEX only) ============
  'WTI Crude Oil': { symbol: 'CL=F', category: 'energy', contractSize: '1,000 bbl', venue: 'NYMEX' },
  'Brent Crude Oil': { symbol: 'BZ=F', category: 'energy', contractSize: '1,000 bbl', venue: 'NYMEX' },
  'Natural Gas': { symbol: 'NG=F', category: 'energy', contractSize: '10,000 MMBtu', venue: 'NYMEX' },
  'Gasoline RBOB': { symbol: 'RB=F', category: 'energy', contractSize: '42,000 gal', venue: 'NYMEX' },
  'Heating Oil': { symbol: 'HO=F', category: 'energy', contractSize: '42,000 gal', venue: 'NYMEX' },

  // ============ EMISSIONS — CME voluntary carbon offsets (Premium) ============
  // ICE compliance markets (EUA/UKA/CCA/RGGI) unavailable — Massive is CME-only.
  // These CBL voluntary offset contracts are thinly traded; surface with a
  // "low liquidity" disclaimer in the UI.
  'CBL GEO': { symbol: 'GEO=F', category: 'emissions', contractSize: '1,000 mtCO2e', venue: 'NYMEX' },
  'CBL N-GEO': { symbol: 'NGO=F', category: 'emissions', contractSize: '1,000 mtCO2e', venue: 'NYMEX' },
  'CBL C-GEO': { symbol: 'CGO=F', category: 'emissions', contractSize: '1,000 mtCO2e', venue: 'NYMEX' },

  // ============ METALS — Free (FMP) ============
  'Gold Futures': { symbol: 'GC=F', category: 'metals', contractSize: '100 oz', venue: 'COMEX' },
  'Silver Futures': { symbol: 'SI=F', category: 'metals', contractSize: '5,000 oz', venue: 'COMEX' },
  'Copper': { symbol: 'HG=F', category: 'metals', contractSize: '25,000 lbs', venue: 'COMEX' },
  'Platinum': { symbol: 'PL=F', category: 'metals', contractSize: '50 oz', venue: 'NYMEX' },
  'Palladium': { symbol: 'PA=F', category: 'metals', contractSize: '100 oz', venue: 'NYMEX' },
  // Micro contracts (COMEX) — Premium
  'Micro Gold': { symbol: 'MGC=F', category: 'metals', contractSize: '10 oz', venue: 'COMEX' },
  'Micro Silver': { symbol: 'SIL=F', category: 'metals', contractSize: '1,000 oz', venue: 'COMEX' },
  'Micro Copper': { symbol: 'MHG=F', category: 'metals', contractSize: '2,500 lbs', venue: 'COMEX' },
  // Ferrous — Premium
  'Steel HRC': { symbol: 'HRC=F', category: 'metals', contractSize: '20 short tons', venue: 'NYMEX' },
  // LME metals (Aluminum, Zinc, Lead, Nickel, Tin) removed 2026-05 — no
  // free/affordable data source covers LME. Revisit if we add CPA Lite or FMP Premium.

  // ============ GRAINS — Free ============
  'Corn Futures': { symbol: 'ZC=F', category: 'grains', contractSize: '5,000 bu', venue: 'CBOT' },
  'Wheat Futures': { symbol: 'ZW=F', category: 'grains', contractSize: '5,000 bu', venue: 'CBOT' },
  'KC HRW Wheat': { symbol: 'KE=F', category: 'grains', contractSize: '5,000 bu', venue: 'CBOT' },
  'Soybean Futures': { symbol: 'ZS=F', category: 'grains', contractSize: '5,000 bu', venue: 'CBOT' },
  'Soybean Oil': { symbol: 'ZL=F', category: 'grains', contractSize: '60,000 lbs', venue: 'CBOT' },
  'Soybean Meal': { symbol: 'ZM=F', category: 'grains', contractSize: '100 tons', venue: 'CBOT' },
  'Oat Futures': { symbol: 'ZO=F', category: 'grains', contractSize: '5,000 bu', venue: 'CBOT' },
  'Rough Rice': { symbol: 'ZR=F', category: 'grains', contractSize: '2,000 cwt', venue: 'CBOT' },
  // Canola (ICE) and all ICE softs (Coffee, Sugar #11, Cotton, Cocoa, OJ)
  // removed 2026-05 — no free/affordable data source covers ICE.

  // ============ LIVESTOCK — Free ============
  'Live Cattle': { symbol: 'LE=F', category: 'livestock', contractSize: '40,000 lbs', venue: 'CME' },
  'Feeder Cattle': { symbol: 'GF=F', category: 'livestock', contractSize: '50,000 lbs', venue: 'CME' },
  'Lean Hogs': { symbol: 'HE=F', category: 'livestock', contractSize: '40,000 lbs', venue: 'CME' },

  // ============ DAIRY (CME) — Premium ============
  'Class III Milk': { symbol: 'DC=F', category: 'dairy', contractSize: '200,000 lbs', venue: 'CME' },
  'Dry Whey': { symbol: 'DY=F', category: 'dairy', contractSize: '44,000 lbs', venue: 'CME' },
  'Cash-Settled Butter': { symbol: 'CB=F', category: 'dairy', contractSize: '20,000 lbs', venue: 'CME' },
  'Nonfat Dry Milk': { symbol: 'GNF=F', category: 'dairy', contractSize: '44,000 lbs', venue: 'CME' },
  'Cash-Settled Cheese': { symbol: 'CSC=F', category: 'dairy', contractSize: '20,000 lbs', venue: 'CME' },

  // ============ INDUSTRIALS — Lumber (free) ============
  'Lumber Futures': { symbol: 'LBS=F', category: 'industrials', contractSize: '110,000 bd ft', venue: 'CME' },
};

/**
 * @deprecated CommodityPriceAPI removed 2026-05 in favour of FMP Starter.
 * Empty object retained so older imports don't break — callers naturally
 * skip CPA branches when symbol lookup returns undefined.
 */
export const COMMODITY_PRICE_API_SYMBOLS: Record<string, string> = {};

/** @deprecated CPA removed. */
export const CENT_QUOTED_SYMBOLS = new Set<string>();

/**
 * Massive Futures product codes. As of 2026-07-14 Massive is the SOLE data
 * source for every commodity in the catalog (energy + non-energy). Anything
 * Massive doesn't quote (ICE/LME/OTC) has been removed from the catalog.
 */
export const MASSIVE_PRODUCT_CODES: Record<string, string> = {
  // Energy (NYMEX)
  'WTI Crude Oil': 'CL',
  'Brent Crude Oil': 'BZ',
  'Natural Gas': 'NG',
  'Gasoline RBOB': 'RB',
  'Heating Oil': 'HO',
  // Metals (COMEX/NYMEX)
  'Gold Futures': 'GC',
  'Silver Futures': 'SI',
  'Copper': 'HG',
  'Platinum': 'PL',
  'Palladium': 'PA',
  'Micro Gold': 'MGC',
  'Micro Silver': 'SIL',
  'Micro Copper': 'MHG',
  'Steel HRC': 'HRC',
  // Grains (CBOT)
  'Corn Futures': 'ZC',
  'Wheat Futures': 'ZW',
  'KC HRW Wheat': 'KE',
  'Soybean Futures': 'ZS',
  'Soybean Oil': 'ZL',
  'Soybean Meal': 'ZM',
  'Oat Futures': 'ZO',
  'Rough Rice': 'ZR',
  // Livestock (CME)
  'Live Cattle': 'LE',
  'Feeder Cattle': 'GF',
  'Lean Hogs': 'HE',
  // Dairy (CME)
  'Class III Milk': 'DC',
  'Dry Whey': 'DY',
  'Cash-Settled Butter': 'CB',
  'Nonfat Dry Milk': 'GNF',
  'Cash-Settled Cheese': 'CSC',
  // Lumber (CME)
  'Lumber Futures': 'LBR',
  // Emissions (NYMEX / CBL voluntary offsets)
  'CBL GEO': 'GEO',
  'CBL N-GEO': 'NGO',
  'CBL C-GEO': 'CGO',
};

/**
 * FMP `/v3/quote/{SYMBOL}` — ICE/LME-listed items only. Massive can't quote
 * these exchanges, so FMP free tier (250 req/day) keeps them alive. 11 items.
 */
/**
 * FMP symbol map — currently empty. All ICE/LME items removed 2026-05 because
 * FMP Starter no longer covers them and we have no alternative free source.
 * Kept exported so callers don't break; CommodityService skips FMP when empty.
 */
export const FMP_SYMBOLS: Record<string, string> = {};

// FMP_FUTURES_ROOTS removed — forward curve now uses Massive (see massive-client.ts).

/**
 * Premium-only commodities. Free tier sees household names; everything niche/regional/exotic
 * lives behind the paywall. See mem://monetization/strategy.
 */
// Free tier: 17 household-name commodities — top 2-4 from each group.
// Everything else is premium-gated. See mem://monetization/strategy.
// Free: household-name commodities. Premium = niche/regional/exotic variants.
export const PREMIUM_COMMODITIES = new Set<string>([
  // Energy — premium (refined products; WTI/Brent/Nat Gas stay free)
  'Gasoline RBOB', 'Heating Oil',
  // Metals — premium
  'Palladium',
  'Micro Gold', 'Micro Silver', 'Micro Copper', 'Steel HRC',
  // Grains — premium
  'Soybean Oil', 'Soybean Meal',
  'Oat Futures', 'Rough Rice',
  'KC HRW Wheat',
  // Livestock — premium
  'Feeder Cattle',
  // Dairy — all premium
  'Class III Milk', 'Dry Whey', 'Cash-Settled Butter', 'Nonfat Dry Milk', 'Cash-Settled Cheese',
  // Emissions — all premium (voluntary offsets, low liquidity)
  'CBL GEO', 'CBL N-GEO', 'CBL C-GEO',
]);

export function isPremiumCommodity(name: string): boolean {
  return PREMIUM_COMMODITIES.has(name);
}

// Category groupings (used by frontend sidebar/screener)
export const CATEGORY_MAPPINGS: Record<string, string[]> = {
  energy: [
    'WTI Crude Oil', 'Brent Crude Oil', 'Natural Gas',
    'Gasoline RBOB', 'Heating Oil',
  ],
  metals: [
    'Gold Futures', 'Silver Futures', 'Copper', 'Platinum', 'Palladium',
    'Micro Gold', 'Micro Silver', 'Micro Copper', 'Steel HRC',
  ],
  grains: [
    'Corn Futures', 'Wheat Futures', 'KC HRW Wheat', 'Soybean Futures', 'Soybean Oil', 'Soybean Meal',
    'Oat Futures', 'Rough Rice',
  ],
  softs: [],
  livestock: [
    'Live Cattle', 'Feeder Cattle', 'Lean Hogs',
  ],
  dairy: [
    'Class III Milk', 'Dry Whey', 'Cash-Settled Butter', 'Nonfat Dry Milk', 'Cash-Settled Cheese',
  ],
  industrials: [
    'Lumber Futures',
  ],
  emissions: [
    'CBL GEO', 'CBL N-GEO', 'CBL C-GEO',
  ],
};

// Helpers
export function getCommodityCategory(commodityName: string): string {
  const symbol = COMMODITY_SYMBOLS[commodityName];
  return symbol?.category || 'other';
}

export function getCommodityByApiSymbol(apiSymbol: string): string | null {
  for (const [name, sym] of Object.entries(COMMODITY_PRICE_API_SYMBOLS)) {
    if (sym === apiSymbol) return name;
  }
  return null;
}

export function getApiSymbolByCommodity(commodityName: string): string | null {
  return COMMODITY_PRICE_API_SYMBOLS[commodityName] || null;
}

export function getAllCommoditiesByCategory(): Record<string, string[]> {
  const categorized: Record<string, string[]> = {};
  for (const [commodityName, details] of Object.entries(COMMODITY_SYMBOLS)) {
    const category = details.category;
    if (!categorized[category]) categorized[category] = [];
    categorized[category].push(commodityName);
  }
  return categorized;
}
