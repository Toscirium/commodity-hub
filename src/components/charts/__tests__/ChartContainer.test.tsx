import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import ChartContainer from '../ChartContainer'
import { TIMEFRAMES } from '../chartUtils'
import { createTestQueryClient } from '@/test/utils'
import type { CommodityHistoricalData } from '@/hooks/useCommodityData'

// Same rationale as PriceChart.test.tsx: stub the charting library entirely
// (jsdom has no real <canvas> 2D context), so this exercises ChartContainer's
// own data pipeline (currency conversion, smoothing, volume/MA computation)
// end-to-end for real, while the actual chart painting is mocked out.
const addSeries = vi.fn()
const setData = vi.fn()
const mockSeries = {
  setData,
  applyOptions: vi.fn(),
  priceToCoordinate: vi.fn(),
  coordinateToPrice: vi.fn(),
  attachPrimitive: vi.fn(),
  detachPrimitive: vi.fn(),
  createPriceLine: vi.fn(() => ({})),
  removePriceLine: vi.fn(),
}
const mockChart = {
  addSeries: addSeries.mockReturnValue(mockSeries),
  applyOptions: vi.fn(),
  remove: vi.fn(),
  subscribeClick: vi.fn(),
  unsubscribeClick: vi.fn(),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  timeScale: () => ({ fitContent: vi.fn(), timeToCoordinate: vi.fn() }),
  priceScale: () => ({ applyOptions: vi.fn() }),
  removeSeries: vi.fn(),
}
vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => mockChart),
  CandlestickSeries: { seriesType: 'Candlestick' },
  LineSeries: { seriesType: 'Line' },
  AreaSeries: { seriesType: 'Area' },
  HistogramSeries: { seriesType: 'Histogram' },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2, LargeDashed: 3, SparseDotted: 4 },
}))

const renderWithQueryClient = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>)

const noop = () => {}
const baseProps = {
  name: 'Gold Futures',
  loading: false,
  error: null,
  isPositiveTrend: true,
  trendlines: [],
  selectedTrendlineId: null,
  onTrendlineCreate: noop,
  onTrendlineSelect: noop,
  onTrendlineDelete: noop,
}

/** Days of history each timeframe pulls, mirroring getHistoryDays in fetch-commodity-data (premium tier, the widest case). */
const TIMEFRAME_DAYS: Record<string, number> = {
  '1d': 5,
  '1m': 60,
  '3m': 180,
  '6m': 365,
  '1y': 730,
  '2y': 730,
};

/**
 * Realistic-shaped, deliberately messy bars: a couple of duplicate dates and
 * one out-of-order entry, the exact conditions that crashed 2Y in production
 * (see the PriceChart fix). Also includes volume on most bars (a couple
 * missing it, as a provider might for a partial bar) and open/close pairs so
 * both candlestick's OHLC filter and the volume up/down coloring get real
 * data to work with, not just a happy-path fixture.
 */
function buildMessyData(days: number): CommodityHistoricalData[] {
  const bars: CommodityHistoricalData[] = [];
  const start = new Date('2023-01-01T00:00:00.000Z').getTime();
  const DAY = 24 * 60 * 60 * 1000;

  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * DAY).toISOString();
    const open = 100 + Math.sin(i / 7) * 10;
    const close = open + (i % 3 === 0 ? -1.5 : 2.25);
    bars.push({
      date,
      price: close,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: i % 11 === 0 ? undefined : 1000 + (i % 50) * 37,
    });
  }

  if (days > 5) {
    // Same-day duplicate (pagination-boundary overlap).
    bars.push({ ...bars[Math.floor(days / 2)], price: bars[Math.floor(days / 2)].price + 0.5 });
    // Out-of-order entry appended at the end but dated mid-range.
    bars.push({ ...bars[Math.floor(days / 4)], date: bars[Math.floor(days / 4)].date, price: 12345 });
  }

  return bars;
}

describe('ChartContainer — every timeframe, realistic + messy data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addSeries.mockReturnValue(mockSeries)
  })

  for (const tf of TIMEFRAMES) {
    for (const chartType of ['line', 'candlestick'] as const) {
      it(`renders without throwing for ${tf.value} (${chartType})`, () => {
        const data = buildMessyData(TIMEFRAME_DAYS[tf.value]);
        expect(() =>
          renderWithQueryClient(
            <ChartContainer {...baseProps} data={data} selectedTimeframe={tf.value} chartType={chartType} />
          )
        ).not.toThrow();
      })
    }
  }

  it('handles an empty dataset for every timeframe without throwing', () => {
    for (const tf of TIMEFRAMES) {
      expect(() =>
        renderWithQueryClient(
          <ChartContainer {...baseProps} data={[]} selectedTimeframe={tf.value} chartType="line" />
        )
      ).not.toThrow();
    }
  })
})
