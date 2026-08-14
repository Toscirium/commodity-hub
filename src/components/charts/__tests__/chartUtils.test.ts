import { describe, expect, it } from 'vitest';
import { TIMEFRAMES, formatTooltipLabel, formatXAxisTick, calculateSMA } from '../chartUtils';

describe('5Y chart utilities', () => {
  it('does not expose a 5Y timeframe — no provider backs more than ~2y of daily history', () => {
    expect(TIMEFRAMES).not.toContainEqual({ label: '5Y', value: '5y' });
  });
});

describe('2Y chart utilities', () => {
  it('exposes a 2Y timeframe', () => {
    expect(TIMEFRAMES).toContainEqual({ label: '2Y', value: '2y' });
  });

  it('uses an unambiguous month and year on the 2Y x-axis', () => {
    expect(formatXAxisTick('2024-07-15T00:00:00.000Z', '2y')).toBe('Jul 2024');
  });

  it('keeps the full date in a 2Y tooltip', () => {
    expect(formatTooltipLabel('2024-07-15T00:00:00.000Z', '2y')).toContain('2024');
  });
});

describe('calculateSMA', () => {
  const bar = (date: string, price: number) => ({ date, price });

  it('returns nothing until enough bars exist for a full window', () => {
    const data = [bar('2024-01-01', 10), bar('2024-01-02', 20)];
    expect(calculateSMA(data, 3)).toEqual([]);
  });

  it('averages exactly the trailing `period` bars, sliding forward', () => {
    const data = [1, 2, 3, 4, 5].map((p, i) => bar(`2024-01-0${i + 1}`, p));
    const sma = calculateSMA(data, 3);
    // window [1,2,3]=2, [2,3,4]=3, [3,4,5]=4
    expect(sma).toEqual([
      { date: '2024-01-03', value: 2 },
      { date: '2024-01-04', value: 3 },
      { date: '2024-01-05', value: 4 },
    ]);
  });
});
