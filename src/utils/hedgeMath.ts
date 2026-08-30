/**
 * Hedge-book maths: converting futures lots into physical quantity so a
 * hedge ratio can be computed against a physical position.
 *
 * A hedge is placed in LOTS (contracts), but a physical position is in tonnes
 * or bushels. Comparing them needs the contract size, which is
 * commodity-specific — CBOT grains are 5,000 bu, soybean meal is 100 short
 * tons, soybean oil is 60,000 lb. Sizes here mirror the `contractSize` values
 * in supabase/functions/_shared/commodity-mappings.ts.
 *
 * Kept separate from commodityUnits.ts because that module converts *prices*
 * and this one converts *quantities* — related but independently testable.
 */

import { COMMODITY_UNITS } from './commodityUnits';

export type PhysicalUnit = 'tonne' | 'bushel' | 'short-ton';

export interface ContractSpec {
  /** Contract size expressed in `unit`. */
  size: number;
  unit: 'bu' | 'short tons' | 'lb' | 'cwt';
}

export const CONTRACT_SIZES: Record<string, ContractSpec> = {
  'Corn Futures': { size: 5000, unit: 'bu' },
  'Wheat Futures': { size: 5000, unit: 'bu' },
  'KC HRW Wheat': { size: 5000, unit: 'bu' },
  'Soybean Futures': { size: 5000, unit: 'bu' },
  'Oat Futures': { size: 5000, unit: 'bu' },
  'Soybean Meal': { size: 100, unit: 'short tons' },
  'Soybean Oil': { size: 60000, unit: 'lb' },
  'Rough Rice': { size: 2000, unit: 'cwt' },
};

const POUNDS_PER_TONNE = 2204.62262;
const SHORT_TONS_PER_TONNE = 1.10231131;
const CWT_PER_TONNE = POUNDS_PER_TONNE / 100;

/** One contract expressed in metric tonnes. Null when unknown. */
export function contractSizeInTonnes(commodityName: string): number | null {
  const spec = CONTRACT_SIZES[commodityName];
  if (!spec) return null;

  switch (spec.unit) {
    case 'bu': {
      const bpt = COMMODITY_UNITS[commodityName]?.bushelsPerTonne;
      if (!bpt) return null;
      return spec.size / bpt;
    }
    case 'short tons':
      return spec.size / SHORT_TONS_PER_TONNE;
    case 'lb':
      return spec.size / POUNDS_PER_TONNE;
    case 'cwt':
      return spec.size / CWT_PER_TONNE;
    default:
      return null;
  }
}

/**
 * Futures lots -> physical quantity in `target` units, so it can be compared
 * against a physical position booked in the trader's own units.
 * Null when the commodity has no known contract spec.
 */
export function futuresLotsToPhysical(
  commodityName: string,
  lots: number,
  target: PhysicalUnit,
): number | null {
  if (!Number.isFinite(lots)) return null;
  const tonnes = contractSizeInTonnes(commodityName);
  if (tonnes == null) return null;
  const totalTonnes = tonnes * lots;

  switch (target) {
    case 'tonne':
      return totalTonnes;
    case 'short-ton':
      return totalTonnes * SHORT_TONS_PER_TONNE;
    case 'bushel': {
      const bpt = COMMODITY_UNITS[commodityName]?.bushelsPerTonne;
      if (!bpt) return null;
      return totalTonnes * bpt;
    }
    default:
      return null;
  }
}

/**
 * Hedged quantity / physical quantity. 1.0 is fully hedged; below 1 leaves
 * price risk, above 1 is over-hedged (itself a speculative position).
 */
export function hedgeRatio(hedgedQuantity: number, physicalQuantity: number): number | null {
  if (!Number.isFinite(hedgedQuantity) || !Number.isFinite(physicalQuantity) || physicalQuantity === 0) {
    return null;
  }
  return hedgedQuantity / physicalQuantity;
}
