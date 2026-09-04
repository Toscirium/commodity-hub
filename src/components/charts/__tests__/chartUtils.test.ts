import { describe, expect, it } from 'vitest';
import {
  TIMEFRAMES,
  formatTooltipLabel,
  formatXAxisTick,
  calculateSMA,
  sliceToTimeframe,
  countTrailingBarsWithinDays,
  timeframeFetchBucket,
} from '../chartUtils';

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

describe('continuous-history helpers', () => {
  // 400 daily bars, one per calendar day, ascending.
  const bars = Array.from({ length: 400 }, (_, i) => ({
    date: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString(),
    price: 100 + i,
  }));

  it('every non-intraday timeframe shares one wide fetch bucket, so switching among them never refetches', () => {
    expect(timeframeFetchBucket('1d')).toBe('1d');
    for (const tf of ['1m', '3m', '6m', '1y', '2y']) {
      expect(timeframeFetchBucket(tf)).toBe('2y');
    }
  });

  it('sliceToTimeframe returns only the trailing window, measured from the last bar', () => {
    const monthSlice = sliceToTimeframe(bars, '1m');
    expect(monthSlice.length).toBeGreaterThan(25);
    expect(monthSlice.length).toBeLessThanOrEqual(31);
    // Ends on the same last bar; only the head is trimmed.
    expect(monthSlice[monthSlice.length - 1]).toBe(bars[bars.length - 1]);
    expect(monthSlice[0]).not.toBe(bars[0]);
  });

  it('sliceToTimeframe returns the whole series when it is shorter than the window', () => {
    expect(sliceToTimeframe(bars, '2y')).toBe(bars);
    expect(sliceToTimeframe([], '1m')).toEqual([]);
  });

  it('countTrailingBarsWithinDays counts bars at the tail within N days of the last one', () => {
    const dates = bars.map((b) => b.date);
    expect(countTrailingBarsWithinDays(dates, 30)).toBe(31); // last bar + 30 days back
    expect(countTrailingBarsWithinDays(dates, 1)).toBe(2);
    expect(countTrailingBarsWithinDays([], 30)).toBe(0);
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
