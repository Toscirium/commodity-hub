import { describe, it, expect } from 'vitest';
import {
  contractSizeInTonnes,
  futuresLotsToPhysical,
  hedgeRatio,
  CONTRACT_SIZES,
} from '../hedgeMath';

describe('contractSizeInTonnes', () => {
  it('corn: 5,000 bu contract is ~127 tonnes', () => {
    // 5000 / 39.3683 bu-per-tonne = 127.01 t — the standard figure a grain
    // trader would recognise for a CBOT corn contract.
    expect(contractSizeInTonnes('Corn Futures')).toBeCloseTo(127.01, 1);
  });

  it('wheat and soybeans: 5,000 bu at the 60 lb bushel is ~136 tonnes', () => {
    expect(contractSizeInTonnes('Wheat Futures')).toBeCloseTo(136.08, 1);
    expect(contractSizeInTonnes('Soybean Futures')).toBeCloseTo(136.08, 1);
  });

  it('corn and wheat contracts differ despite both being 5,000 bu', () => {
    // The bug this guards: treating a bushel as commodity-independent.
    expect(contractSizeInTonnes('Corn Futures')).not.toBeCloseTo(
      contractSizeInTonnes('Wheat Futures')!, 1,
    );
  });

  it('soybean meal: 100 short tons is ~90.7 tonnes', () => {
    expect(contractSizeInTonnes('Soybean Meal')).toBeCloseTo(90.72, 1);
  });

  it('soybean oil: 60,000 lb is ~27.2 tonnes', () => {
    expect(contractSizeInTonnes('Soybean Oil')).toBeCloseTo(27.22, 1);
  });

  it('returns null for commodities with no contract spec', () => {
    expect(contractSizeInTonnes('WTI Crude Oil')).toBeNull();
    expect(contractSizeInTonnes('Nonexistent')).toBeNull();
  });
});

describe('futuresLotsToPhysical', () => {
  it('scales linearly with lots', () => {
    const one = futuresLotsToPhysical('Corn Futures', 1, 'tonne')!;
    const ten = futuresLotsToPhysical('Corn Futures', 10, 'tonne')!;
    expect(ten).toBeCloseTo(one * 10, 6);
  });

  it('round-trips back to the contract size in bushels', () => {
    // 1 corn lot expressed in bushels must be exactly the contract size.
    expect(futuresLotsToPhysical('Corn Futures', 1, 'bushel')).toBeCloseTo(
      CONTRACT_SIZES['Corn Futures'].size, 6,
    );
  });

  it('round-trips soybean meal back to short tons', () => {
    expect(futuresLotsToPhysical('Soybean Meal', 1, 'short-ton')).toBeCloseTo(100, 6);
  });

  it('zero lots is zero, not null — an unhedged position is valid', () => {
    expect(futuresLotsToPhysical('Corn Futures', 0, 'tonne')).toBe(0);
  });

  it('returns null for unknown commodities rather than guessing', () => {
    expect(futuresLotsToPhysical('WTI Crude Oil', 5, 'tonne')).toBeNull();
  });

  it('returns null on non-finite lots', () => {
    expect(futuresLotsToPhysical('Corn Futures', Number.NaN, 'tonne')).toBeNull();
  });
});

describe('hedgeRatio', () => {
  it('fully hedged is 1.0', () => {
    expect(hedgeRatio(127.01, 127.01)).toBeCloseTo(1, 6);
  });

  it('under-hedged is below 1', () => {
    expect(hedgeRatio(63.5, 127.01)).toBeLessThan(1);
  });

  it('over-hedged is above 1', () => {
    expect(hedgeRatio(254, 127.01)).toBeGreaterThan(1);
  });

  it('guards divide-by-zero rather than returning Infinity', () => {
    expect(hedgeRatio(100, 0)).toBeNull();
  });

  it('realistic case: 8 corn lots against 1,000 tonnes is ~102% hedged', () => {
    const hedged = futuresLotsToPhysical('Corn Futures', 8, 'tonne')!;
    const ratio = hedgeRatio(hedged, 1000)!;
    expect(ratio).toBeCloseTo(1.016, 2);
  });
});
