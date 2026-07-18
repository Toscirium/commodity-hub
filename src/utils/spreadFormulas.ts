/**
 * Built-in spread presets. Each preset computes a derived value from live commodity prices.
 * Use lower-case substring matching to be resilient to naming differences across data sources.
 */
export interface SpreadLeg {
  match: string[]; // first commodity whose name contains any of these (case-insensitive)
  weight: number; // positive = long, negative = short
}

export interface SpreadPreset {
  id: string;
  name: string;
  description: string;
  legs: SpreadLeg[];
  unit: string;
}

/**
 * Custom spread formula persisted in user_spreads.formula (jsonb).
 * - op 'sum'   → Σ(leg.weight × price)
 * - op 'ratio' → legs[0].price / legs[1].price (weights ignored)
 */
export interface CustomSpreadFormula {
  op: 'sum' | 'ratio';
  unit: string;
  legs: SpreadLeg[];
}

export const SPREAD_PRESETS: SpreadPreset[] = [
  {
    id: 'wti-brent',
    name: 'WTI – Brent',
    description: 'Atlantic vs US Gulf benchmark differential. Negative = WTI discount.',
    legs: [
      { match: ['wti'], weight: 1 },
      { match: ['brent'], weight: -1 },
    ],
    unit: '$/bbl',
  },
  {
    id: 'crack-321',
    name: '3:2:1 Crack Spread',
    description: 'Refining margin: 3 barrels crude → 2 gasoline + 1 heating oil/diesel.',
    legs: [
      { match: ['gasoline', 'rbob'], weight: 2 / 3 * 42 }, // convert $/gal → $/bbl
      { match: ['heating', 'diesel', 'ulsd'], weight: 1 / 3 * 42 },
      { match: ['wti'], weight: -1 },
    ],
    unit: '$/bbl',
  },
  {
    id: 'crush',
    name: 'Soybean Crush',
    description: 'Soy processing margin: meal + oil revenue minus bean cost.',
    legs: [
      { match: ['soybean meal'], weight: 0.022 },
      { match: ['soybean oil'], weight: 11 },
      { match: ['soybean'], weight: -1 },
    ],
    unit: '$/bu',
  },
  {
    id: 'gold-silver',
    name: 'Gold / Silver Ratio',
    description: 'Classic safe-haven ratio. Historical mean ~65.',
    legs: [
      { match: ['gold'], weight: 1 },
      { match: ['silver'], weight: -1 }, // ratio handled in compute
    ],
    unit: 'ratio',
  },
  {
    id: 'natgas-wti',
    name: 'Nat Gas / WTI BTU Ratio',
    description: 'Energy parity (gas in $/mmBtu vs WTI $/bbl ÷ 5.8).',
    legs: [
      { match: ['natural gas', 'henry hub'], weight: 1 },
      { match: ['wti'], weight: 1 / 5.8 }, // converted, used in custom op
    ],
    unit: 'ratio',
  },
];

export interface CommodityPrice { name: string; price: number }

function findLegPrice(commodities: CommodityPrice[], match: string[]): number | null {
  const lc = commodities.map((c) => ({ ...c, lc: c.name.toLowerCase() }));
  for (const m of match) {
    const hit = lc.find((c) => c.lc.includes(m));
    if (hit && typeof hit.price === 'number') return hit.price;
  }
  return null;
}

/** Returns null if any leg price is missing. */
export function computeSpread(preset: SpreadPreset, commodities: CommodityPrice[]): number | null {
  if (preset.id === 'gold-silver') {
    const gold = findLegPrice(commodities, ['gold']);
    const silver = findLegPrice(commodities, ['silver']);
    return gold && silver ? gold / silver : null;
  }
  if (preset.id === 'natgas-wti') {
    const gas = findLegPrice(commodities, ['natural gas', 'henry hub']);
    const wti = findLegPrice(commodities, ['wti']);
    return gas && wti ? gas / (wti / 5.8) : null;
  }
  let total = 0;
  for (const leg of preset.legs) {
    const p = findLegPrice(commodities, leg.match);
    if (p == null) return null;
    total += p * leg.weight;
  }
  return total;
}

/** Compute a user-defined custom spread. */
export function computeCustomSpread(
  formula: CustomSpreadFormula,
  commodities: CommodityPrice[],
): number | null {
  if (!formula?.legs?.length) return null;
  if (formula.op === 'ratio') {
    if (formula.legs.length < 2) return null;
    const a = findLegPrice(commodities, formula.legs[0].match);
    const b = findLegPrice(commodities, formula.legs[1].match);
    return a && b ? a / b : null;
  }
  let total = 0;
  for (const leg of formula.legs) {
    const p = findLegPrice(commodities, leg.match);
    if (p == null) return null;
    total += p * (leg.weight ?? 0);
  }
  return total;
}