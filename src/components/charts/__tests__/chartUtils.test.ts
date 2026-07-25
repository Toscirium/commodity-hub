import { describe, expect, it } from 'vitest';
import { TIMEFRAMES, formatTooltipLabel, formatXAxisTick } from '../chartUtils';

describe('5Y chart utilities', () => {
  it('exposes a 5Y timeframe', () => {
    expect(TIMEFRAMES).toContainEqual({ label: '5Y', value: '5y' });
  });

  it('uses an unambiguous month and year on the 5Y x-axis', () => {
    expect(formatXAxisTick('2024-07-15T00:00:00.000Z', '5y')).toBe('Jul 2024');
  });

  it('keeps the full date in a 5Y tooltip', () => {
    expect(formatTooltipLabel('2024-07-15T00:00:00.000Z', '5y')).toContain('2024');
  });
});
