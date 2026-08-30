import { describe, it, expect } from 'vitest';
import {
  convertFuturesQuote,
  nativeToUsdPerTonne,
  nativeToUsdPerBushel,
  availableUnits,
  supportsWeightUnits,
  unitLabel,
} from '../commodityUnits';

// Reference values are the real quotes observed in commodity_price_snapshots
// on 2026-08-30, so these assert against actual production data shapes rather
// than invented numbers.
const CORN = 550.75;      // cents/bu
const WHEAT = 797.5;      // cents/bu
const SOYBEAN = 1276.25;  // cents/bu
const MEAL = 350.4;       // USD/short ton
const OIL = 70.95;        // cents/lb

describe('commodityUnits — bushel-quoted grains', () => {
  it('converts corn cents/bu to USD/bu', () => {
    expect(nativeToUsdPerBushel('Corn Futures', CORN)).toBeCloseTo(5.5075, 6);
  });

  it('converts corn to USD/tonne using the 56 lb bushel factor', () => {
    // 5.5075 $/bu * 39.3683 bu/t = 216.82 $/t
    expect(nativeToUsdPerTonne('Corn Futures', CORN)).toBeCloseTo(216.82, 1);
  });

  it('uses a DIFFERENT factor for wheat than corn (60 lb vs 56 lb bushel)', () => {
    // 7.975 $/bu * 36.7437 bu/t = 293.03 $/t
    expect(nativeToUsdPerTonne('Wheat Futures', WHEAT)).toBeCloseTo(293.03, 1);
    // Same nominal cents quote must NOT produce the same $/t for corn vs wheat.
    const cornAt797 = nativeToUsdPerTonne('Corn Futures', WHEAT);
    const wheatAt797 = nativeToUsdPerTonne('Wheat Futures', WHEAT);
    expect(cornAt797).not.toBeCloseTo(wheatAt797!, 1);
  });

  it('converts soybeans to USD/tonne', () => {
    // 12.7625 $/bu * 36.7437 bu/t = 468.99 $/t
    expect(nativeToUsdPerTonne('Soybean Futures', SOYBEAN)).toBeCloseTo(468.99, 1);
  });

  it('oats use the 32 lb bushel factor', () => {
    // 4.00 $/bu * 64.842 = 259.37 $/t
    expect(nativeToUsdPerTonne('Oat Futures', 400)).toBeCloseTo(259.37, 1);
  });
});

describe('commodityUnits — non-bushel quotes', () => {
  it('converts soybean meal from USD/short ton to USD/tonne (heavier tonne = higher price)', () => {
    // 350.4 * 1.10231131 = 386.26
    expect(nativeToUsdPerTonne('Soybean Meal', MEAL)).toBeCloseTo(386.25, 1);
    // A metric tonne is heavier than a short ton, so $/t must exceed $/short ton.
    expect(nativeToUsdPerTonne('Soybean Meal', MEAL)!).toBeGreaterThan(MEAL);
  });

  it('converts soybean oil from cents/lb to USD/tonne', () => {
    // 0.7095 $/lb * 2204.62262 lb/t = 1564.18
    expect(nativeToUsdPerTonne('Soybean Oil', OIL)).toBeCloseTo(1564.18, 1);
  });

  it('meal has no USD/bu conversion — it is not bushel-quoted', () => {
    expect(nativeToUsdPerBushel('Soybean Meal', MEAL)).toBeNull();
  });
});

describe('convertFuturesQuote', () => {
  it('native returns the raw quote untouched', () => {
    expect(convertFuturesQuote('Corn Futures', CORN, 'native')).toBe(CORN);
  });

  it('applies the FX rate for EUR/t', () => {
    const usdPerTonne = nativeToUsdPerTonne('Corn Futures', CORN)!;
    expect(convertFuturesQuote('Corn Futures', CORN, 'EUR/t', 0.92)).toBeCloseTo(usdPerTonne * 0.92, 4);
  });

  it('returns null for EUR/t when no FX rate is supplied — must not silently use 1.0', () => {
    expect(convertFuturesQuote('Corn Futures', CORN, 'EUR/t')).toBeNull();
    expect(convertFuturesQuote('Corn Futures', CORN, 'EUR/t', 0)).toBeNull();
  });

  it('returns null for weight units on commodities with no weight basis (e.g. crude)', () => {
    expect(convertFuturesQuote('WTI Crude Oil', 83.4, 'USD/t')).toBeNull();
    expect(convertFuturesQuote('WTI Crude Oil', 83.4, 'EUR/t', 0.92)).toBeNull();
  });

  it('returns null on non-finite input rather than NaN', () => {
    expect(convertFuturesQuote('Corn Futures', Number.NaN, 'USD/t')).toBeNull();
  });

  it('regression: the original bug — raw subtraction across units', () => {
    // A Dutch trader quoting EUR 195/tonne cash against corn.
    const cashEurPerTonne = 195;
    const naive = cashEurPerTonne - CORN;                       // the old, wrong maths
    const converted = convertFuturesQuote('Corn Futures', CORN, 'EUR/t', 0.92)!;
    const correct = cashEurPerTonne - converted;

    expect(naive).toBeCloseTo(-355.75, 2);     // nonsense
    expect(correct).toBeGreaterThan(-30);      // a plausible basis, tens not hundreds
    expect(correct).toBeLessThan(30);
  });
});

describe('availableUnits / labels', () => {
  it('offers USD/bu only for bushel-quoted commodities', () => {
    expect(availableUnits('Corn Futures')).toContain('USD/bu');
    expect(availableUnits('Soybean Meal')).not.toContain('USD/bu');
  });

  it('offers only native for commodities with no weight basis', () => {
    expect(availableUnits('WTI Crude Oil')).toEqual(['native']);
    expect(supportsWeightUnits('WTI Crude Oil')).toBe(false);
  });

  it('labels the native unit per commodity convention', () => {
    expect(unitLabel('native', 'Corn Futures')).toBe('¢/bu');
    expect(unitLabel('native', 'Soybean Meal')).toBe('$/short ton');
    expect(unitLabel('EUR/t')).toBe('€/tonne');
  });
});
