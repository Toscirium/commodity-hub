/**
 * Unit-aware price conversion for CommodityPriceAPI (CPA) responses.
 *
 * CPA returns each rate alongside a `metadata[symbol].unit` string like:
 *   "Lb", "lbs", "Kg", "T" (metric ton), "T.oz" (troy oz), "Cwt", "Bu",
 *   "Doz", "Gal", "Mbf", "100 Kg", "50,000 lbs"
 *
 * Some symbols carry MISLEADING unit labels (CPA quirks observed empirically),
 * so we keep a per-symbol SOURCE_UNIT_OVERRIDE table for those. Everything
 * else trusts CPA's metadata.
 *
 * Replaces the older binary CENT_QUOTED_SYMBOLS flag, which couldn't express
 * $/lb vs $/kg vs $/bu vs $/mt distinctions.
 */

export type Unit =
  | 'usd_per_lb' | 'usd_per_kg' | 'usd_per_g'
  | 'usd_per_troy_oz'
  | 'usd_per_mt'         // metric ton
  | 'usd_per_short_ton'  // 2000 lb
  | 'usd_per_cwt'        // 100 lb (US hundredweight)
  | 'usd_per_bu'         // bushel (commodity-specific weight)
  | 'cents_per_lb' | 'cents_per_bu'
  | 'usd_per_gal' | 'usd_per_mbf' | 'usd_per_doz'
  | 'pass_through';

const KG_PER_LB = 0.45359237;
const LB_PER_KG = 1 / KG_PER_LB;             // 2.20462
const G_PER_TROY_OZ = 31.1034768;
const LB_PER_TROY_OZ = G_PER_TROY_OZ * KG_PER_LB / 1; // ~0.0686 (kept for completeness)

// USDA bushel weights in lbs.
const BU_LB: Record<string, number> = {
  CORN: 56,
  'SOYBEAN-FUT': 60, 'SOYBEAN-SPOT': 60,
  'ZW-SPOT': 60, 'ZW-FUT': 60,
  'OAT-SPOT': 32, 'OAT-FUT': 32,
};

/** Parse CPA's metadata.unit into our Unit + a quantity multiplier. */
export function parseCpaUnit(raw: string | undefined): { unit: Unit; perCount: number } {
  if (!raw) return { unit: 'pass_through', perCount: 1 };
  const r = raw.trim();
  // Scaled forms like "100 Kg" or "50,000 lbs".
  const m = r.match(/^([\d,]+)\s+(.+)$/);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    const inner = parseCpaUnit(m[2]);
    return { unit: inner.unit, perCount: inner.perCount * (isFinite(n) && n > 0 ? n : 1) };
  }
  switch (r.toLowerCase()) {
    case 'lb': case 'lbs': case 'pound': return { unit: 'usd_per_lb', perCount: 1 };
    case 'kg':  return { unit: 'usd_per_kg', perCount: 1 };
    case 'g':   return { unit: 'usd_per_g',  perCount: 1 };
    case 't.oz': case 'oz':                return { unit: 'usd_per_troy_oz',   perCount: 1 };
    case 't': case 'mt': case 'tonne':     return { unit: 'usd_per_mt',        perCount: 1 };
    case 'cwt': return { unit: 'usd_per_cwt', perCount: 1 };
    case 'bu':  return { unit: 'usd_per_bu',  perCount: 1 };
    case 'gal': return { unit: 'usd_per_gal', perCount: 1 };
    case 'mbf': return { unit: 'usd_per_mbf', perCount: 1 };
    case 'doz': case 'dozen': return { unit: 'usd_per_doz', perCount: 1 };
    default: return { unit: 'pass_through', perCount: 1 };
  }
}

/**
 * SYMBOL → forced source unit. Use ONLY when CPA's metadata.unit is wrong/misleading
 * for that symbol. Discovered empirically by comparing raw values to real-world prices.
 */
export const SOURCE_UNIT_OVERRIDE: Record<string, { unit: Unit; perCount?: number }> = {
  // Empirically-verified overrides (CPA's metadata.unit is wrong/missing for these).
  // Wheat/Oats futures: raw ~615/355 → cents/bu (real ~$6/bu, ~$3.5/bu).
  'ZW-SPOT':      { unit: 'cents_per_bu' },
  'ZW-FUT':       { unit: 'cents_per_bu' },
  'OAT-SPOT':     { unit: 'cents_per_bu' },
  'OAT-FUT':      { unit: 'cents_per_bu' },
  // Sugar #11 raw ~15 → cents/lb (real ~$0.18/lb).
  LS11:           { unit: 'cents_per_lb' },
  // Lean Hogs raw ~95 with unit="T" but real value is ~$0.95/lb.
  LHOGS:          { unit: 'cents_per_lb' },
  // Feeder Cattle raw ~367 with bogus unit "50,000 lbs" — actually cents/lb.
  FC1:            { unit: 'cents_per_lb' },
  // Live Cattle raw ~185 with unit label "Lb" — actually cents/lb (real ~$1.85/lb).
  LC1:            { unit: 'cents_per_lb' },
  // CORN, SOYBEAN-FUT, SOYBEAN-SPOT, ZL, CT: CPA returns these in $/bu or $/lb directly
  // (NOT cents). Trust metadata or treat as pass-through. Do NOT add overrides here.
};

/** Per-symbol target display unit. Drives both API conversion and fallback baselines. */
export const DISPLAY_UNIT: Record<string, Unit> = {
  // Precious metals — $/troy oz
  XAU: 'usd_per_troy_oz', XAG: 'usd_per_troy_oz',
  PL:  'usd_per_troy_oz', PA:  'usd_per_troy_oz', XRH: 'usd_per_troy_oz',
  // Industrial metals — $/lb (familiar US quote)
  'HG-SPOT': 'usd_per_lb', 'HG-FUT': 'usd_per_lb',
  // Grains — $/bu
  CORN:           'usd_per_bu',
  'ZW-SPOT':      'usd_per_bu', 'ZW-FUT': 'usd_per_bu',
  'OAT-SPOT':     'usd_per_bu', 'OAT-FUT': 'usd_per_bu',
  'SOYBEAN-FUT':  'usd_per_bu', 'SOYBEAN-SPOT': 'usd_per_bu',
  // Soy products
  ZL: 'usd_per_lb',
  ZM: 'usd_per_short_ton',
  // Softs — $/lb (Cocoa stays $/mt)
  CA: 'usd_per_lb', LS11: 'usd_per_lb', CT: 'usd_per_lb',
  CC: 'usd_per_mt', OJ: 'usd_per_lb', LS: 'usd_per_mt',
  // Livestock — $/lb
  LC1: 'usd_per_lb', LHOGS: 'usd_per_lb', FC1: 'usd_per_lb',
  // Dairy / eggs
  'EGGS-US': 'usd_per_doz', 'EGGS-CH': 'usd_per_doz',
  CHE: 'usd_per_lb', BUTTER: 'usd_per_lb', MILK: 'usd_per_cwt',
  // (No DISPLAY_UNIT entry → pass through whatever CPA returned, normalized to per-1.)
};

/** Convert between mass-/quantity-based units. Returns null if incompatible. */
export function convertUnit(value: number, from: Unit, to: Unit, symbol?: string): number | null {
  if (from === to) return value;
  if (from === 'pass_through' || to === 'pass_through') return value;

  // Strip cents → USD first.
  if (from === 'cents_per_lb') return convertUnit(value / 100, 'usd_per_lb', to, symbol);
  if (from === 'cents_per_bu') return convertUnit(value / 100, 'usd_per_bu', to, symbol);
  if (to === 'cents_per_lb') {
    const v = convertUnit(value, from, 'usd_per_lb', symbol);
    return v === null ? null : v * 100;
  }
  if (to === 'cents_per_bu') {
    const v = convertUnit(value, from, 'usd_per_bu', symbol);
    return v === null ? null : v * 100;
  }

  // Mass-based (express price as $/lb internally, then convert out).
  const toLb: Partial<Record<Unit, number>> = {
    usd_per_lb: 1,
    usd_per_kg: KG_PER_LB,            // $/kg → $/lb : multiply by kg-per-lb
    usd_per_g:  KG_PER_LB / 1000,
    usd_per_mt: KG_PER_LB / 1000,     // $/mt → $/lb : /2204.62
    usd_per_short_ton: 1 / 2000,
    usd_per_cwt: 1 / 100,
    usd_per_troy_oz: LB_PER_TROY_OZ === 0 ? 0 : 1 / LB_PER_TROY_OZ, // $/oz → $/lb
  };
  // Helper: convert $/X → $/lb by multiplying value by (lb per X)^-1.
  // Cleaner formulation: $/lb = $/X * (X per lb).
  const xPerLb: Partial<Record<Unit, number>> = {
    usd_per_lb: 1,
    usd_per_kg: 1 / LB_PER_KG,        // 1 lb = 0.4536 kg
    usd_per_g:  1000 / LB_PER_KG,     // 1 lb = 453.6 g
    usd_per_mt: 1 / (1000 * LB_PER_KG), // 1 lb in mt
    usd_per_short_ton: 1 / 2000,
    usd_per_cwt: 1 / 100,
    usd_per_troy_oz: KG_PER_LB * 1000 / G_PER_TROY_OZ, // 1 lb in troy oz
  };
  if (xPerLb[from] !== undefined && xPerLb[to] !== undefined) {
    const usdPerLb = value * xPerLb[from]!;
    return usdPerLb / xPerLb[to]!;
  }

  // Bushel ↔ mass via per-commodity bushel weight in lbs.
  if (symbol && BU_LB[symbol]) {
    const buLb = BU_LB[symbol];
    if (from === 'usd_per_bu' && to === 'usd_per_lb') return value / buLb;
    if (from === 'usd_per_lb' && to === 'usd_per_bu') return value * buLb;
    if (from === 'usd_per_bu' && xPerLb[to] !== undefined) return (value / buLb) / xPerLb[to]!;
    if (xPerLb[from] !== undefined && to === 'usd_per_bu') {
      const usdPerLb = value * xPerLb[from]!;
      return usdPerLb * buLb;
    }
  }

  return null;
}

/**
 * Main entry point: given a raw CPA value + its metadata.unit string + the symbol,
 * return the converted price in our DISPLAY_UNIT (or pass through if no target set).
 */
export function convertCpaPriceToDisplay(
  rawValue: number,
  rawUnit: string | undefined,
  symbol: string,
): { price: number; unit: Unit } {
  const override = SOURCE_UNIT_OVERRIDE[symbol];
  const source = override
    ? { unit: override.unit, perCount: override.perCount ?? 1 }
    : parseCpaUnit(rawUnit);

  // Normalize "per N units" → "per 1 unit" (e.g. "50,000 lbs" → /50000).
  const perOne = rawValue / (source.perCount || 1);

  const target = DISPLAY_UNIT[symbol];
  if (!target) return { price: perOne, unit: source.unit };

  const out = convertUnit(perOne, source.unit, target, symbol);
  if (out === null) {
    console.warn(`[unit-convert] ${symbol}: cannot convert ${source.unit} → ${target}, passing raw`);
    return { price: perOne, unit: source.unit };
  }
  return { price: out, unit: target };
}
