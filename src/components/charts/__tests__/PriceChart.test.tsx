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
})
