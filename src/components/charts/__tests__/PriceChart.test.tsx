import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import PriceChart, { toSortedSeriesData } from '../PriceChart'
import type { UTCTimestamp } from 'lightweight-charts'

const addSeries = vi.fn()
const setData = vi.fn()
const applyOptions = vi.fn()
const priceToCoordinate = vi.fn()
const coordinateToPrice = vi.fn()
const attachPrimitive = vi.fn()
const detachPrimitive = vi.fn()
const fitContent = vi.fn()
const timeToCoordinate = vi.fn()
const createPriceLine = vi.fn(() => ({}))
const removePriceLine = vi.fn()

const mockSeries = {
  setData,
  applyOptions,
  priceToCoordinate,
  coordinateToPrice,
  attachPrimitive,
  detachPrimitive,
  createPriceLine,
  removePriceLine,
}

const mockChart = {
  addSeries: addSeries.mockReturnValue(mockSeries),
  applyOptions: vi.fn(),
  remove: vi.fn(),
  subscribeClick: vi.fn(),
  unsubscribeClick: vi.fn(),
  subscribeCrosshairMove: vi.fn(),
  unsubscribeCrosshairMove: vi.fn(),
  timeScale: () => ({ fitContent, timeToCoordinate }),
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

const baseProps = {
  formatXAxisTick: (d: string) => d,
  formatTooltipLabel: (d: string) => d,
  formatPrice: (p: number) => `$${p.toFixed(2)}`,
  commodityName: 'Gold',
  isPositiveTrend: true,
  trendlines: [],
  selectedTrendlineId: null,
  onTrendlineCreate: vi.fn(),
  onTrendlineSelect: vi.fn(),
  onTrendlineDelete: vi.fn(),
}

describe('PriceChart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addSeries.mockReturnValue(mockSeries)
  })

  it('adds a candlestick series and pushes OHLC data with numeric time when chartType is candlestick', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="candlestick"
        lineData={[]}
        candlestickData={[{ date: '2024-01-01T00:00:00.000Z', open: 1, high: 2, low: 0.5, close: 1.5 }]}
      />
    )

    expect(addSeries).toHaveBeenCalledWith(
      expect.objectContaining({ seriesType: 'Candlestick' }),
      expect.any(Object)
    )
    expect(setData).toHaveBeenCalledWith([
      expect.objectContaining({ time: expect.any(Number), open: 1, high: 2, low: 0.5, close: 1.5 }),
    ])
  })

  it('adds an area series and pushes value data with numeric time when chartType is line', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 42 }]}
        candlestickData={[]}
      />
    )

    expect(addSeries).toHaveBeenCalledWith(
      expect.objectContaining({ seriesType: 'Area' }),
      expect.any(Object)
    )
    expect(setData).toHaveBeenCalledWith([
      expect.objectContaining({ time: expect.any(Number), value: 42 }),
    ])
  })

  it('pins a dashed reference line at the first bar\'s price, matching the period-open the % change elsewhere is measured against', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[
          { date: '2024-01-01T00:00:00.000Z', price: 100 },
          { date: '2024-01-02T00:00:00.000Z', price: 110 },
        ]}
        candlestickData={[]}
      />
    )

    expect(createPriceLine).toHaveBeenCalledWith(expect.objectContaining({ price: 100, lineStyle: 2 }))
  })

  it('replaces the old reference line rather than stacking a new one when data changes', () => {
    // Note: PriceChart's chartVersion bump-after-mount means every
    // chartVersion-dependent effect (this one included) legitimately fires
    // twice during the initial mount alone — pre-existing, harmless (same
    // for the main setData push), and internal to a single commit cycle
    // before paint. So this asserts the *delta* the rerender causes rather
    // than an absolute count, to avoid pinning that unrelated detail.
    const { rerender } = render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 100 }]}
        candlestickData={[]}
      />
    )
    const removalsBeforeRerender = removePriceLine.mock.calls.length

    rerender(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-03T00:00:00.000Z', price: 200 }]}
        candlestickData={[]}
      />
    )

    expect(removePriceLine.mock.calls.length).toBeGreaterThan(removalsBeforeRerender)
    expect(createPriceLine).toHaveBeenLastCalledWith(expect.objectContaining({ price: 200 }))
  })

  it('shows the no-OHLC-data message for candlestick mode when there is no candle data', () => {
    const { getByText } = render(
      <PriceChart {...baseProps} chartType="candlestick" lineData={[]} candlestickData={[]} />
    )
    expect(getByText(/No OHLC data available/i)).toBeInTheDocument()
  })

  it('adds a volume histogram series on its own price scale and pushes colored bars', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 42 }]}
        candlestickData={[]}
        volumeData={[{ date: '2024-01-01T00:00:00.000Z', value: 1000, up: true }]}
      />
    )

    expect(addSeries).toHaveBeenCalledWith(
      expect.objectContaining({ seriesType: 'Histogram' }),
      expect.objectContaining({ priceScaleId: 'volume' })
    )
    expect(setData).toHaveBeenCalledWith([
      expect.objectContaining({ time: expect.any(Number), value: 1000, color: expect.any(String) }),
    ])
  })

  it('adds one line series per moving average and pushes its data', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 42 }]}
        candlestickData={[]}
        maData={[{ period: 5, data: [{ date: '2024-01-01T00:00:00.000Z', value: 41 }] }]}
      />
    )

    expect(setData).toHaveBeenCalledWith([
      expect.objectContaining({ time: expect.any(Number), value: 41 }),
    ])
  })

  // lightweight-charts' setData() throws (crashing the chart, and with it the
  // page) if input isn't strictly ascending by time with unique timestamps.
  // Wide ranges like 2Y are the most likely to surface a provider quirk that
  // violates this — this pins the sort+dedupe safety net that guards it.
  it('sorts and deduplicates out-of-order/duplicate timestamps before calling setData', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[
          { date: '2024-01-03T00:00:00.000Z', price: 3 },
          { date: '2024-01-01T00:00:00.000Z', price: 1 },
          { date: '2024-01-02T00:00:00.000Z', price: 2 },
          { date: '2024-01-01T00:00:00.000Z', price: 1.5 }, // duplicate timestamp — later value wins
        ]}
        candlestickData={[]}
      />
    )

    const mainSeriesCall = setData.mock.calls.find((call) =>
      call[0].some((point: { value?: number }) => point.value === 3)
    )
    expect(mainSeriesCall![0]).toEqual([
      expect.objectContaining({ value: 1.5 }),
      expect.objectContaining({ value: 2 }),
      expect.objectContaining({ value: 3 }),
    ])
  })

  it('drops non-finite values before calling setData instead of pushing NaN into the chart', () => {
    render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[
          { date: '2024-01-01T00:00:00.000Z', price: NaN },
          { date: '2024-01-02T00:00:00.000Z', price: 7 },
        ]}
        candlestickData={[]}
      />
    )

    expect(setData).toHaveBeenCalledWith([expect.objectContaining({ value: 7 })])
  })
})

// The mocked lightweight-charts module above is a plain vi.fn() stub — it
// doesn't replicate the real library's runtime assertion that setData()
// input must be strictly ascending by time with unique timestamps. So the
// tests above only prove *this code calls setData with sorted arguments*,
// not that the real library would accept them. This tests the actual
// invariant directly, at roughly 2Y scale (~730 daily bars — the timeframe
// that originally crashed), independent of any mock.
describe('toSortedSeriesData', () => {
  const isStrictlyAscendingUnique = (points: { time: UTCTimestamp }[]) =>
    points.every((p, i) => i === 0 || (p.time as number) > (points[i - 1].time as number))

  it('produces strictly ascending, unique timestamps from a realistic 2Y-scale dataset with duplicates and shuffling', () => {
    const DAY = 86_400 as UTCTimestamp
    const start = 1_700_000_000 as UTCTimestamp

    // ~730 daily bars, each carrying a distinct value so a dedupe bug (wrong
    // point kept) would be as detectable as an ordering bug.
    const points = Array.from({ length: 730 }, (_, i) => ({
      time: (start + i * DAY) as UTCTimestamp,
      value: i,
    }))

    // A handful of exact duplicate timestamps, as a provider pagination
    // boundary overlap would produce.
    const duplicates = [10, 200, 500, 729].map((i) => ({ time: points[i].time, value: 9999 + i }))

    // Simple deterministic shuffle (Fisher-Yates with a fixed seed) rather
    // than Math.random(), so a failure is reproducible.
    const input = [...points, ...duplicates]
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    for (let i = input.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[input[i], input[j]] = [input[j], input[i]]
    }

    const result = toSortedSeriesData(input)

    expect(isStrictlyAscendingUnique(result)).toBe(true)
    expect(result).toHaveLength(730) // duplicates collapsed, nothing else lost
    // Duplicate timestamps resolve to the later occurrence in *input* order,
    // not necessarily the pre-shuffle "original" bar — just confirm exactly
    // one survivor per timestamp and that it came from the known candidate set.
    for (const i of [10, 200, 500, 729]) {
      const survivor = result.find((p) => p.time === points[i].time)
      expect([points[i].value, 9999 + i]).toContain(survivor?.value)
    }
  })

  it('is a no-op on already-sorted, unique input', () => {
    const input = [1, 2, 3].map((t) => ({ time: t as UTCTimestamp, value: t }))
    expect(toSortedSeriesData(input)).toEqual(input)
  })
})

// The mock's setData is otherwise a no-op that never throws — the real
// library can, on a provider quirk toSortedSeriesData didn't anticipate.
// This simulates that directly (rather than trying to reproduce the exact
// upstream condition) to prove the failure mode is "this update is skipped,
// logged, chart keeps whatever it had" rather than "render throws".
describe('PriceChart — resilience to a setData failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addSeries.mockReturnValue(mockSeries)
  })

  it('does not throw when the underlying library rejects the data, and logs instead', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    setData.mockImplementationOnce(() => {
      throw new Error('Assertion failed: data must be asc ordered by time')
    })

    expect(() =>
      render(
        <PriceChart
          {...baseProps}
          chartType="line"
          lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 42 }]}
          candlestickData={[]}
        />
      )
    ).not.toThrow()

    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
