import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import PriceChart from '../PriceChart'

const addSeries = vi.fn()
const setData = vi.fn()
const applyOptions = vi.fn()
const priceToCoordinate = vi.fn()
const coordinateToPrice = vi.fn()
const attachPrimitive = vi.fn()
const detachPrimitive = vi.fn()
const fitContent = vi.fn()
const timeToCoordinate = vi.fn()

const mockSeries = {
  setData,
  applyOptions,
  priceToCoordinate,
  coordinateToPrice,
  attachPrimitive,
  detachPrimitive,
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
