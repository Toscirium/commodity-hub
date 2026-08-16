/**
 * Shared vocabulary for the "manual position" and "statement import" paths
 * on the Portfolio page (see src/components/AddPositionForm.tsx and
 * src/components/ImportPositionsDialog.tsx). Kept in one place so the
 * dropdown a user picks from and the fuzzy matcher used when importing a
 * broker statement stay in sync.
 */

// Commodity options for the dropdown — must match names the
// fetch-commodity-prices edge function knows how to price.
export const COMMODITY_OPTIONS = [
  'Gold Futures',
  'Silver Futures',
  'WTI Crude Oil',
  'Natural Gas',
  'Copper',
  'Platinum',
  'Palladium',
  'Brent Crude Oil',
  'Corn Futures',
  'Wheat Futures',
  'Soybean Futures',
  'Live Cattle Futures',
  'Lean Hogs Futures',
  'Coffee Futures',
  'Sugar Futures',
  'Cotton Futures',
  'Cocoa Futures',
] as const;

export type CommodityOption = (typeof COMMODITY_OPTIONS)[number];

// Brokers whose CFD instrument names commonly differ from our own labels.
// Not an exhaustive or verified list of every alias a broker export might
// use — it's a best-effort first guess that the user can always override
// in the import mapping step or the manual "Broker" field.
const COMMODITY_ALIASES: Record<CommodityOption, string[]> = {
  'Gold Futures': ['gold', 'xauusd', 'xau/usd', 'gold spot'],
  'Silver Futures': ['silver', 'xagusd', 'xag/usd', 'silver spot'],
  'WTI Crude Oil': ['oil - crude wti', 'crude oil wti', 'wti', 'wti crude', 'usoil', 'oil.wti/usd', 'us crude oil'],
  'Natural Gas': ['natural gas', 'ng', 'natgas'],
  Copper: ['copper'],
  Platinum: ['platinum', 'xptusd'],
  Palladium: ['palladium', 'xpdusd'],
  'Brent Crude Oil': ['oil - crude brent', 'crude oil brent', 'brent', 'brent oil', 'ukoil', 'oil.brent/usd'],
  'Corn Futures': ['corn'],
  'Wheat Futures': ['wheat'],
  'Soybean Futures': ['soybean', 'soybeans', 'soya'],
  'Live Cattle Futures': ['live cattle', 'cattle'],
  'Lean Hogs Futures': ['lean hogs', 'hogs'],
  'Coffee Futures': ['coffee'],
  'Sugar Futures': ['sugar'],
  'Cotton Futures': ['cotton'],
  'Cocoa Futures': ['cocoa'],
};

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Best-effort match of a freeform instrument name (from a broker statement,
 * or typed by hand) to one of our known commodity options. Returns null if
 * nothing looks close enough — callers should fall back to asking the user.
 */
export function matchCommodityOption(raw: string): CommodityOption | null {
  if (!raw) return null;
  const needle = normalize(raw);

  // Exact match against our own labels first.
  const exact = COMMODITY_OPTIONS.find((opt) => normalize(opt) === needle);
  if (exact) return exact;

  // Then known broker aliases (exact alias match).
  for (const option of COMMODITY_OPTIONS) {
    if (COMMODITY_ALIASES[option].some((alias) => normalize(alias) === needle)) {
      return option;
    }
  }

  // Finally, loose substring match either direction, e.g. "Gold" -> "Gold Futures",
  // or "WTI Crude Oil - Cash" -> "WTI Crude Oil".
  for (const option of COMMODITY_OPTIONS) {
    const candidates = [option, ...COMMODITY_ALIASES[option]].map(normalize);
    if (candidates.some((c) => needle.includes(c) || c.includes(needle))) {
      return option;
    }
  }

  return null;
}

export const KNOWN_BROKERS = ['eToro', 'Other'] as const;
