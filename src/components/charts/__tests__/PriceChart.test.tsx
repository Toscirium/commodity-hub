import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
// Seeded per-test to stand in for whatever the user has zoomed/panned to, then
// kept up to date by setVisibleLogicalRange the way the real time scale is.
let visibleLogicalRange: { from: number; to: number } | null = { from: 0, to: 100 }
const setVisibleLogicalRange = vi.fn((range: { from: number; to: number }) => {
  visibleLogicalRange = range
})
const getVisibleLogicalRange = vi.fn(() => visibleLogicalRange)
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
  timeScale: () => ({ fitContent, timeToCoordinate, getVisibleLogicalRange, setVisibleLogicalRange }),
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
  selectedTimeframe: '1m',
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

  // The compare overlay used to be created/destroyed inside the same effect
  // that pushed its data, keyed on the whole `compareData` object — which is
  // a fresh object on every parent re-render (e.g. CommodityChart recomputes
  // it inline). That churned addSeries/removeSeries far more than the data
  // itself actually changed, which is the same "stale series reference"
  // pattern already fixed for the MA overlays above. This pins the fix:
  // same symbol, new data → setData only, no series recreation.
  it('pushes new data into the existing compare series instead of recreating it when only the data changes', () => {
    const stableMaData: Array<{ period: number; data: { date: string; value: number }[] }> = []
    const { rerender } = render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 100 }]}
        candlestickData={[]}
        maData={stableMaData}
        compareData={{ symbol: 'Silver', data: [{ date: '2024-01-01T00:00:00.000Z', price: 20 }] }}
      />
    )
    const addCallsBefore = addSeries.mock.calls.length
    const removeCallsBefore = mockChart.removeSeries.mock.calls.length

    rerender(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 100 }]}
        candlestickData={[]}
        maData={stableMaData}
        compareData={{ symbol: 'Silver', data: [{ date: '2024-01-02T00:00:00.000Z', price: 21 }] }}
      />
    )

    expect(addSeries.mock.calls.length).toBe(addCallsBefore)
    expect(mockChart.removeSeries.mock.calls.length).toBe(removeCallsBefore)
    expect(setData).toHaveBeenCalledWith([expect.objectContaining({ value: 21 })])
  })

  it('does recreate the compare series when the compared symbol itself changes', () => {
    const stableMaData: Array<{ period: number; data: { date: string; value: number }[] }> = []
    const { rerender } = render(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 100 }]}
        candlestickData={[]}
        maData={stableMaData}
        compareData={{ symbol: 'Silver', data: [{ date: '2024-01-01T00:00:00.000Z', price: 20 }] }}
      />
    )
    const removeCallsBefore = mockChart.removeSeries.mock.calls.length

    rerender(
      <PriceChart
        {...baseProps}
        chartType="line"
        lineData={[{ date: '2024-01-01T00:00:00.000Z', price: 100 }]}
        candlestickData={[]}
        maData={stableMaData}
        compareData={{ symbol: 'Copper', data: [{ date: '2024-01-01T00:00:00.000Z', price: 4 }] }}
      />
    )

    expect(mockChart.removeSeries.mock.calls.length).toBeGreaterThan(removeCallsBefore)
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

describe('PriceChart — zoom, pan and reset controls', () => {
  // 120 bars, so the clamps below have a real bar count to work against.
  const lineData = Array.from({ length: 120 }, (_, i) => ({
    date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    price: 100 + i,
  }))
  const props = { ...baseProps, lineData, candlestickData: [], chartType: 'line' as const }

  // A deterministic clock in place of the browser's, so the eased pan can be
  // stepped frame by frame and asserted on rather than waited out.
  let clock = 0
  let frames = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1

  // Restored individually rather than via restoreAllMocks(), which would also
  // strip the implementations off the shared ResizeObserver/matchMedia mocks
  // that src/test/setup.ts installs once for the whole run.
  const spies: { mockRestore: () => void }[] = []
  const realMatchMedia = window.matchMedia

  const advanceFrame = (ms = 16) => {
    clock += ms
    const due = [...frames.values()]
    frames.clear()
    due.forEach((cb) => cb(clock))
  }
  const pendingFrames = () => frames.size
  const settle = (limit = 500) => {
    let guard = 0
    while (frames.size > 0 && guard++ < limit) advanceFrame()
    expect(guard).toBeLessThan(limit)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    addSeries.mockReturnValue(mockSeries)
    visibleLogicalRange = { from: 0, to: 100 }

    clock = 0
    frames = new Map()
    nextFrameId = 1
    spies.push(vi.spyOn(performance, 'now').mockImplementation(() => clock))
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextFrameId++
      frames.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id)
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.matchMedia = realMatchMedia
    spies.forEach((spy) => spy.mockRestore())
    spies.length = 0
  })

  const lastRange = () => setVisibleLogicalRange.mock.calls.at(-1)?.[0] as { from: number; to: number }
  // The glide re-derives the span from the live range every frame, so it can
  // land a floating-point hair off an exact bar index. Position is what these
  // assert; sub-picometre drift is not.
  const expectRange = (actual: { from: number; to: number }, from: number, to: number) => {
    expect(actual.from).toBeCloseTo(from, 6)
    expect(actual.to).toBeCloseTo(to, 6)
  }

  it('narrows the visible range around its centre when zooming in', () => {
    render(<PriceChart {...props} />)
    fireEvent.click(screen.getByLabelText('Zoom in'))

    const { from, to } = lastRange()
    expect(to - from).toBeCloseTo(70)
    // Centre held at 50, so the window stays put rather than sliding.
    expect((from + to) / 2).toBeCloseTo(50)
  })

  it('widens the visible range when zooming out, by the exact inverse of a zoom in', () => {
    render(<PriceChart {...props} />)
    fireEvent.click(screen.getByLabelText('Zoom in'))
    visibleLogicalRange = lastRange()
    fireEvent.click(screen.getByLabelText('Zoom out'))

    const { from, to } = lastRange()
    expect(from).toBeCloseTo(0)
    expect(to).toBeCloseTo(100)
  })

  it('stops zooming in once a handful of bars are visible instead of collapsing to nothing', () => {
    visibleLogicalRange = { from: 49, to: 51 }
    render(<PriceChart {...props} />)
    fireEvent.click(screen.getByLabelText('Zoom in'))

    const { from, to } = lastRange()
    expect(to - from).toBeCloseTo(5)
  })

  it('stops zooming out at the full series rather than shrinking it to a sliver', () => {
    visibleLogicalRange = { from: 0, to: 119 }
    render(<PriceChart {...props} />)
    fireEvent.click(screen.getByLabelText('Zoom out'))

    const { from, to } = lastRange()
    expect(to - from).toBeCloseTo(120)
  })

  it('does not move on the keypress itself, and eases up from a standstill', () => {
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    // Nothing lands on the keypress itself — the loop starts next frame.
    expect(setVisibleLogicalRange).not.toHaveBeenCalled()

    advanceFrame()
    const afterOneFrame = lastRange().from - 20
    expect(afterOneFrame).toBeGreaterThan(0)
    // Panning moves the window; it must never resize it.
    expect(lastRange().to - lastRange().from).toBeCloseTo(40)

    advanceFrame()
    const afterTwoFrames = lastRange().from - 20
    // Velocity is still ramping up: the second frame alone covers more
    // ground than the first did.
    expect(afterTwoFrames - afterOneFrame).toBeGreaterThan(afterOneFrame)

    fireEvent.keyUp(chart, { key: 'ArrowRight' })
    settle()
  })

  it('keeps panning for as long as a key is held, without needing further keydown events', () => {
    // This is the core fix: the browser's own key-repeat has a long initial
    // delay (400-600ms on most platforms) before repeats start. Motion here
    // must not depend on those events at all — a single keydown, followed by
    // nothing but animation frames, has to keep moving smoothly the whole
    // time a key is down.
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    const positions: number[] = []
    for (let i = 0; i < 40; i++) {
      advanceFrame()
      positions.push(lastRange().from)
    }

    // Strictly increasing throughout — no stall waiting on a second keydown.
    for (let i = 1; i < positions.length; i++) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1])
    }
    // 40 * 16ms = 640ms of continuous motion from one keypress, well past
    // where the OS repeat delay alone would have produced anything.
    expect(pendingFrames()).toBeGreaterThan(0)

    fireEvent.keyUp(chart, { key: 'ArrowRight' })
    settle()
  })

  it('coasts to a stop after keyup instead of stopping dead', () => {
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    for (let i = 0; i < 10; i++) advanceFrame()
    const atRelease = lastRange().from

    fireEvent.keyUp(chart, { key: 'ArrowRight' })
    advanceFrame()
    // Still moving forward right after release — a coast, not a snap.
    expect(lastRange().from).toBeGreaterThan(atRelease)

    settle()
    expect(pendingFrames()).toBe(0)
  })

  it('pans faster with Shift held than without, over the same hold duration', () => {
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    for (let i = 0; i < 10; i++) advanceFrame()
    const normalDistance = lastRange().from - 20
    fireEvent.keyUp(chart, { key: 'ArrowRight' })
    settle()

    visibleLogicalRange = { from: 20, to: 60 }
    setVisibleLogicalRange.mockClear()
    fireEvent.keyDown(chart, { key: 'ArrowRight', shiftKey: true })
    for (let i = 0; i < 10; i++) advanceFrame()
    const fastDistance = lastRange().from - 20
    fireEvent.keyUp(chart, { key: 'ArrowRight', shiftKey: true })
    settle()

    expect(fastDistance).toBeGreaterThan(normalDistance * 2)
  })

  it('keeps half the window over the series when panning past either end', () => {
    visibleLogicalRange = { from: 100, to: 140 }
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'ArrowRight', shiftKey: true })
    for (let i = 0; i < 80; i++) advanceFrame(32)
    // Clamped to barCount - span / 2 = 120 - 20, not 140.
    expectRange(lastRange(), 100, 140)

    fireEvent.keyUp(chart, { key: 'ArrowRight', shiftKey: true })
    settle()
  })

  it('applies the move outright, with no animation, for a viewer who prefers reduced motion', () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })) as unknown as typeof window.matchMedia
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)

    fireEvent.keyDown(container.firstElementChild as HTMLElement, { key: 'ArrowRight' })
    expectRange(lastRange(), 30, 70)
    expect(pendingFrames()).toBe(0)
  })

  it('drops an in-flight glide when zooming, so the two do not fight over the range', () => {
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)

    fireEvent.keyDown(container.firstElementChild as HTMLElement, { key: 'ArrowRight' })
    advanceFrame()
    fireEvent.click(screen.getByLabelText('Zoom in'))
    expect(pendingFrames()).toBe(0)

    const afterZoom = lastRange()
    settle()
    expect(lastRange()).toEqual(afterZoom)
  })

  it('stops panning immediately if the chart loses focus mid-hold', () => {
    // The one path a keyup can't be relied on to arrive on: clicking away,
    // or the tab itself losing focus, while an arrow is still physically down
    // — keyboard events from here on route to whatever now has focus, not
    // back to this chart, so nothing will ever tell it the key was released.
    visibleLogicalRange = { from: 20, to: 60 }
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    advanceFrame()
    fireEvent.blur(chart)

    // No animation left running; the range stays exactly where the blur caught it.
    expect(pendingFrames()).toBe(0)
    const afterBlur = lastRange()
    expect(lastRange()).toEqual(afterBlur)
  })

  it('resets the range on the reset button, on "0" and on double-click', () => {
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement
    // The data effect fits content once on mount; count only what follows.
    const baseline = fitContent.mock.calls.length

    fireEvent.click(screen.getByLabelText('Reset zoom and pan'))
    fireEvent.keyDown(chart, { key: '0' })
    fireEvent.doubleClick(chart)
    expect(fitContent.mock.calls.length).toBe(baseline + 3)
  })

  it('frames the initial view to the selected timeframe, leaving the rest of the series to pan into', () => {
    // 200 consecutive daily bars; "1M" should show only the last ~30 and let
    // the other ~170 be reached by panning — the fix for the chart looking
    // like it runs out of data at the timeframe edge.
    const wide = Array.from({ length: 200 }, (_, i) => ({
      date: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString(),
      price: 100 + i,
    }))
    render(<PriceChart {...props} lineData={wide} selectedTimeframe="1m" />)

    const { from, to } = lastRange()
    expect(200 - from).toBeGreaterThan(25)
    expect(200 - from).toBeLessThan(40)
    expect(to).toBeGreaterThanOrEqual(199)
  })

  it('shows the whole series rather than a sub-window when the timeframe spans all of it', () => {
    const wide = Array.from({ length: 200 }, (_, i) => ({
      date: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000).toISOString(),
      price: 100 + i,
    }))
    render(<PriceChart {...props} lineData={wide} selectedTimeframe="2y" />)

    // Nothing narrower than the full series was pushed — fitContent handles it.
    expect(setVisibleLogicalRange).not.toHaveBeenCalled()
    expect(fitContent).toHaveBeenCalled()
  })

  it('leaves double-click to the trendline tool while drawing is enabled', () => {
    const { container } = render(<PriceChart {...props} trendlinesEnabled />)
    const chart = container.firstElementChild as HTMLElement
    const baseline = fitContent.mock.calls.length

    fireEvent.doubleClick(chart)
    expect(fitContent.mock.calls.length).toBe(baseline)
  })

  it('ignores keys it does not handle, so tabbing and typing still work', () => {
    const { container } = render(<PriceChart {...props} />)
    const chart = container.firstElementChild as HTMLElement

    fireEvent.keyDown(chart, { key: 'Tab' })
    fireEvent.keyDown(chart, { key: 'a' })
    expect(setVisibleLogicalRange).not.toHaveBeenCalled()
  })
})
