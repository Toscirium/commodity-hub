import { describe, expect, it } from 'vitest';
import { TIMEFRAMES, formatTooltipLabel, formatXAxisTick } from '../chartUtils';

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
