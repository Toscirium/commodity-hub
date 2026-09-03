import React from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { TrendingUp, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPrice as formatCommodityPrice } from '@/lib/commodityUtils';
import { prefersReducedMotion } from '@/utils/accessibility';
import { useIsDarkMode, getLightweightChartColors, toUtcTimestamp, CHART_FONT_FAMILY } from './lightweightChartTheme';
import { TrendlinePrimitive } from './trendlinePrimitive';
import type { Trendline, TrendlinePoint } from '@/hooks/useTrendlines';

export interface PriceChartCompareData {
  symbol: string;
  data: { date: string; price: number }[];
}

export interface PriceChartVolumePoint {
  date: string;
  value: number;
  up: boolean;
}

export interface PriceChartMovingAverage {
  period: number;
  data: { date: string; value: number }[];
}

interface PriceChartProps {
  lineData: { date: string; price: number }[];
  candlestickData: { date: string; open: number; high: number; low: number; close: number }[];
  /** Volume histogram beneath the main series. Omit/empty to skip the volume subplot entirely. */
  volumeData?: PriceChartVolumePoint[];
  /** SMA overlays (e.g. 5/10/20-period), line-chart mode only. Empty entries (not enough bars yet) are skipped. */
  maData?: PriceChartMovingAverage[];
  chartType: 'line' | 'candlestick';
  formatXAxisTick: (date: string) => string;
  formatTooltipLabel: (label: string) => string;
  formatPrice: (price: number) => string;
  commodityName: string;
  isPositiveTrend: boolean;
  compareData?: PriceChartCompareData | null;
  onCompareRemove?: () => void;
  trendlinesEnabled?: boolean;
  trendlines: Trendline[];
  selectedTrendlineId: string | null;
  onTrendlineCreate: (p1: TrendlinePoint, p2: TrendlinePoint) => void;
  onTrendlineSelect: (id: string | null) => void;
  onTrendlineDelete: (id: string) => void;
  onPendingTrendlineChange?: (pending: boolean) => void;
  /** false for an edge-to-edge chart with no visible frame around it (e.g. bled flush to a card's edges). Defaults to true. */
  bordered?: boolean;
  /**
   * false for a chart embedded inline in a scrollable page (e.g. the
   * dashboard card preview) — disables single-finger touch panning so a
   * vertical swipe that starts on the chart still scrolls the page instead
   * of getting captured as a chart pan. Pinch-zoom and desktop click-drag
   * stay on either way. Defaults to true (full-screen view, where page
   * scroll is locked anyway, always wants this on).
   */
  interactive?: boolean;
}

type MainSeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>;

// Distinct from trendlineColor (purple) and compareColor (amber) so all the
// overlays stay visually separable on the same chart.
const MA_COLORS = ['#f97316', '#eab308', '#6366f1'];

// Exact reciprocals, so a zoom in immediately followed by a zoom out lands
// back on the range you started from rather than drifting a little each time.
const ZOOM_IN_FACTOR = 0.7;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;
// Below a handful of bars the chart stops saying anything — mostly empty pane
// with a candle in it — and there is no gesture back out except reset.
const MIN_VISIBLE_BARS = 5;
// Keyboard panning is a small physics sim, not a per-keypress animation: a
// held key drives a velocity that eases up to full speed and coasts back to
// zero on release, entirely on our own requestAnimationFrame loop. It is
// deliberately NOT driven by keydown/its `repeat` events — the OS's own
// key-repeat has a long initial delay (400-600ms on most platforms) before
// repeats start, then repeats at whatever rate the user's OS is configured
// for. An earlier version re-targeted a short ease on every repeat event,
// which read as "glide, go dead still for the repeat delay, then a burst of
// further glides" rather than one continuous motion — keydown/keyup here
// only toggle which direction is held; the loop supplies its own timing.
//
// Window-fractions crossed per second once fully up to speed. ~0.9 means a
// hold long enough to fully ramp up crosses most of the visible window in a
// second — brisk without being hard to stop precisely on a bar.
const PAN_SPEED_WINDOWS_PER_SEC = 0.9;
// Shift pans fast, for covering a lot of ground.
const PAN_FAST_SPEED_MULTIPLIER = 3;
// Time constant of the velocity ramp — how quickly panning eases up to full
// speed on press, and back down to zero on release. Applied to velocity
// rather than position, so both the start and the stop of a hold read as a
// glide instead of a jerk, for a hold of any length.
const PAN_VELOCITY_TIME_CONSTANT_MS = 140;
// Below this the residual velocity is imperceptible; once here with no key
// held, the animation loop stops rather than scheduling frames forever.
const PAN_VELOCITY_EPSILON = 0.01;
// A backgrounded tab or one stalled frame hands back a huge delta; clamping it
// keeps the chart from lurching when the page comes back.
const MAX_PAN_FRAME_MS = 50;

const formatVolume = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
};

/**
 * lightweight-charts requires setData() input to be strictly ascending by
 * time with no duplicate timestamps, or it throws (taking the whole chart —
 * and with it the page — down with it). Provider data occasionally has
 * same-day duplicates or out-of-order bars, and that only reliably surfaces
 * on wide ranges like 2Y, so every series pushed to the chart goes through
 * this rather than trusting the upstream feed to already be well-formed.
 * On a duplicate timestamp, the later occurrence in input order wins.
 */
export function toSortedSeriesData<T extends { time: UTCTimestamp }>(points: T[]): T[] {
  const byTime = new Map<UTCTimestamp, T>();
  for (const p of points) byTime.set(p.time, p);
  return Array.from(byTime.values()).sort((a, b) => (a.time as number) - (b.time as number));
}

interface TooltipState {
  x: number;
  y: number;
  dateIso: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number;
  compareValue?: number;
  volume?: number;
}

const PriceChart: React.FC<PriceChartProps> = ({
  lineData,
  candlestickData,
  volumeData = [],
  maData = [],
  chartType,
  formatXAxisTick,
  formatTooltipLabel,
  formatPrice,
  commodityName,
  isPositiveTrend,
  compareData = null,
  onCompareRemove,
  trendlinesEnabled = false,
  trendlines,
  selectedTrendlineId,
  onTrendlineCreate,
  onTrendlineSelect,
  onTrendlineDelete,
  onPendingTrendlineChange,
  bordered = true,
  interactive = true,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<MainSeries | null>(null);
  const volumeSeriesRef = React.useRef<ISeriesApi<'Histogram'> | null>(null);
  const compareSeriesRef = React.useRef<ISeriesApi<'Line'> | null>(null);
  const maSeriesRefs = React.useRef<ISeriesApi<'Line'>[]>([]);
  const referenceLineRef = React.useRef<IPriceLine | null>(null);
  const primitivesRef = React.useRef<Map<string, TrendlinePrimitive>>(new Map());

  const [chartVersion, setChartVersion] = React.useState(0);
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const [pendingPoint, setPendingPoint] = React.useState<TrendlinePoint | null>(null);

  const isDark = useIsDarkMode();
  const colors = React.useMemo(() => getLightweightChartColors(isDark), [isDark]);

  // Create (and recreate on type/theme change) the chart + main series.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const primitives = primitivesRef.current;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: colors.background }, textColor: colors.text, fontFamily: CHART_FONT_FAMILY },
      grid: {
        // Dotted rather than solid — closer to how faint a trading app's
        // grid usually reads; it's there to align your eye, not to compete
        // with the data.
        vertLines: { color: colors.grid, style: LineStyle.Dotted },
        horzLines: { color: colors.grid, style: LineStyle.Dotted },
      },
      crosshair: { mode: CrosshairMode.Normal },
      // Defaults let a stray drag near the price/time axis edge — or just a
      // mouse wheel scrolling past the chart on the page — silently squash
      // or stretch the scale. Panning (drag) and deliberate two-finger pinch
      // stay on; the accidental-looking ones are off. The reset-zoom button
      // (top-right) always undoes whatever this leaves in place.
      //
      // horzTouchDrag additionally follows `interactive`: when this chart is
      // embedded inline in a scrollable page (interactive=false), a
      // single-finger drag that starts on the chart falls through to the
      // page's own vertical scroll instead of being captured as a chart pan
      // — that capture was the "fights the page scroll" bug. Full-screen
      // (interactive=true) has no competing page scroll to fight (body
      // scroll is locked there), so it keeps touch panning.
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: interactive,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        // In the immersive chart there is no page scroll to preserve, so a
        // mouse wheel is an intuitive, precise way to inspect a time range.
        // Inline charts leave it off, allowing normal page scrolling.
        mouseWheel: interactive,
        pinch: true,
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatXAxisTick(new Date((time as number) * 1000).toISOString()),
      },
      rightPriceScale: {
        borderColor: colors.border,
        // Leave the bottom quarter of the scale for the volume subplot,
        // rather than letting the price series stretch over it.
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      localization: { priceFormatter: (price: number) => formatPrice(price) },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const trendColor = isPositiveTrend ? colors.upColor : colors.downColor;
    const series: MainSeries =
      chartType === 'candlestick'
        ? chart.addSeries(CandlestickSeries, {
            upColor: colors.upColor,
            downColor: colors.downColor,
            wickUpColor: colors.wickUpColor,
            wickDownColor: colors.wickDownColor,
            borderUpColor: colors.wickUpColor,
            borderDownColor: colors.wickDownColor,
            priceLineVisible: true,
            lastValueVisible: true,
            priceLineStyle: LineStyle.Dashed,
          })
        : chart.addSeries(AreaSeries, {
            lineColor: trendColor,
            topColor: `${trendColor}4D`,
            bottomColor: `${trendColor}00`,
            lineWidth: 2,
            priceLineVisible: true,
            lastValueVisible: true,
            priceLineStyle: LineStyle.Dashed,
          });

    // Volume histogram, confined to its own bottom-anchored price scale so it
    // never competes with the main series for vertical space.
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
    });

    // MA overlays — a fixed MA_COLORS.length of them, created once here
    // (like every other series) rather than torn down and rebuilt on every
    // maData change. maData is always MA_COLORS.length entries in practice
    // (ChartContainer computes a fixed [5, 10, 20]); a separate effect below
    // just calls setData on whichever of these already exist per update.
    // This used to recreate 3 series via addSeries/removeSeries on every
    // data refetch (react-query refetches reasonably often), which is a
    // plausible trigger for an internal lightweight-charts assertion
    // ("Value is undefined" in ensureDefined, seen in a production crash
    // report) if a stale reference briefly outlives a torn-down series.
    const maSeries = MA_COLORS.map((color) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
    );

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;
    maSeriesRefs.current = maSeries;
    compareSeriesRef.current = null;
    // The reference price line belongs to the series being torn down below;
    // null it out so the data-push effect (which reruns right after, via
    // chartVersion) creates a fresh one on the new series instead of trying
    // to remove a handle that no longer belongs to it.
    referenceLineRef.current = null;
    primitives.clear();
    setChartVersion((v) => v + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      maSeriesRefs.current = [];
      compareSeriesRef.current = null;
      referenceLineRef.current = null;
      primitives.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, isDark, interactive]);

  // Keep the area-series color in sync with trend direction without a full chart recreate.
  React.useEffect(() => {
    if (chartType !== 'line' || !seriesRef.current) return;
    const trendColor = isPositiveTrend ? colors.upColor : colors.downColor;
    (seriesRef.current as ISeriesApi<'Area'>).applyOptions({
      lineColor: trendColor,
      topColor: `${trendColor}4D`,
      bottomColor: `${trendColor}00`,
    });
  }, [isPositiveTrend, chartType, colors, chartVersion]);

  // Push main series data, and keep a dashed reference line pinned to the
  // first bar's price — the period-open, matching what the price-change %
  // shown elsewhere in the UI is measured against, so the two stay visually
  // consistent. Distinct from the live price line: neutral gray, not
  // up/down-colored, so it doesn't compete with today's actual direction.
  //
  // The whole body is one try/catch: toSortedSeriesData + the finite filters
  // guard the known failure modes, but lightweight-charts' setData/
  // createPriceLine can still throw on something neither anticipated (a
  // provider quirk we haven't seen yet). There's an ErrorBoundary above this
  // component, but that unmounts and remounts the whole chart on every such
  // error; failing this one update softly — keep whatever was on screen,
  // log it, try again next data change — is a better failure mode for a
  // chart the user is actively interacting with (e.g. mid-timeframe-switch).
  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    try {
      let referencePrice: number | undefined;
      if (chartType === 'candlestick') {
        const sorted = toSortedSeriesData(
          candlestickData
            .filter((d) => [d.open, d.high, d.low, d.close].every(Number.isFinite))
            .map((d) => ({
              time: toUtcTimestamp(d.date),
              open: d.open,
              high: d.high,
              low: d.low,
              close: d.close,
            }))
        );
        (series as ISeriesApi<'Candlestick'>).setData(sorted);
        referencePrice = sorted[0]?.open;
      } else {
        const sorted = toSortedSeriesData(
          lineData
            .filter((d) => Number.isFinite(d.price))
            .map((d) => ({ time: toUtcTimestamp(d.date), value: d.price }))
        );
        (series as ISeriesApi<'Area'>).setData(sorted);
        referencePrice = sorted[0]?.value;
      }
      chartRef.current?.timeScale().fitContent();

      if (referenceLineRef.current) {
        series.removePriceLine(referenceLineRef.current);
        referenceLineRef.current = null;
      }
      if (referencePrice !== undefined) {
        referenceLineRef.current = series.createPriceLine({
          price: referencePrice,
          color: colors.referenceLineColor,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: '',
        });
      }
    } catch (err) {
      console.error('PriceChart: failed to update main series/reference line, leaving prior chart state in place', err);
    }
  }, [chartType, candlestickData, lineData, colors.referenceLineColor, chartVersion]);

  // Push volume histogram data, colored per-bar by ChartContainer.
  React.useEffect(() => {
    if (!volumeSeriesRef.current) return;
    try {
      volumeSeriesRef.current.setData(
        toSortedSeriesData(
          volumeData
            .filter((d) => Number.isFinite(d.value))
            .map((d) => ({
              time: toUtcTimestamp(d.date),
              value: d.value,
              color: d.up ? `${colors.upColor}80` : `${colors.downColor}80`,
            }))
        )
      );
    } catch (err) {
      console.error('PriceChart: failed to update volume series, leaving prior chart state in place', err);
    }
  }, [volumeData, colors.upColor, colors.downColor, chartVersion]);

  // Push MA overlay data. The series themselves are created once, in the
  // chart-creation effect above — this only ever calls setData on whichever
  // already exist, by index, same as the main/volume series.
  React.useEffect(() => {
    const series = maSeriesRefs.current;
    if (series.length === 0) return;
    try {
      maData.forEach((ma, i) => {
        series[i]?.setData(
          toSortedSeriesData(
            ma.data
              .filter((d) => Number.isFinite(d.value))
              .map((d) => ({ time: toUtcTimestamp(d.date), value: d.value }))
          )
        );
      });
    } catch (err) {
      console.error('PriceChart: failed to update MA overlay series, leaving prior chart state in place', err);
    }
  }, [maData, chartVersion]);

  // Resize the chart to fill its container.
  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        chartRef.current?.applyOptions({ width, height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Crosshair-driven tooltip.
  React.useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const handler = (param: MouseEventParams<Time>) => {
      if (!param.point || param.time === undefined) {
        setTooltip(null);
        return;
      }
      const mainValue = param.seriesData.get(series) as
        | { open?: number; high?: number; low?: number; close?: number; value?: number }
        | undefined;
      if (!mainValue) {
        setTooltip(null);
        return;
      }
      const compareSeries = compareSeriesRef.current;
      const compareValue = compareSeries
        ? (param.seriesData.get(compareSeries) as { value?: number } | undefined)
        : undefined;
      const volumeSeries = volumeSeriesRef.current;
      const volumePoint = volumeSeries
        ? (param.seriesData.get(volumeSeries) as { value?: number } | undefined)
        : undefined;

      setTooltip({
        x: param.point.x,
        y: param.point.y,
        dateIso: new Date((param.time as number) * 1000).toISOString(),
        open: mainValue.open,
        high: mainValue.high,
        low: mainValue.low,
        close: mainValue.close,
        value: mainValue.value,
        compareValue: compareValue?.value,
        volume: volumePoint?.value,
      });
    };

    chart.subscribeCrosshairMove(handler);
    return () => chart.unsubscribeCrosshairMove(handler);
  }, [chartVersion]);

  // Click handling: draw trendlines (two-click commit) when enabled, otherwise select/deselect.
  React.useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const handler = (param: MouseEventParams<Time>) => {
      if (trendlinesEnabled) {
        if (!param.point || param.time === undefined) return;
        const price = series.coordinateToPrice(param.point.y);
        if (price === null) return;
        const point: TrendlinePoint = { time: param.time as UTCTimestamp, price };

        if (!pendingPoint) {
          setPendingPoint(point);
        } else {
          onTrendlineCreate(pendingPoint, point);
          setPendingPoint(null);
        }
        return;
      }

      const hoveredId = (param.hoveredObjectId ?? null) as string | null;
      onTrendlineSelect(hoveredId);
    };

    chart.subscribeClick(handler);
    return () => chart.unsubscribeClick(handler);
  }, [trendlinesEnabled, chartVersion, pendingPoint, onTrendlineCreate, onTrendlineSelect]);

  // Escape cancels an in-progress trendline; report pending state up so the parent
  // can defer to this (e.g. not exit fullscreen) while a line is being drawn.
  React.useEffect(() => {
    onPendingTrendlineChange?.(pendingPoint !== null);
  }, [pendingPoint, onPendingTrendlineChange]);

  React.useEffect(() => {
    if (!trendlinesEnabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pendingPoint) {
        setPendingPoint(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [trendlinesEnabled, pendingPoint]);

  // Delete/Backspace removes the selected trendline (not while typing elsewhere).
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== 'Delete' && e.key !== 'Backspace') || !selectedTrendlineId) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      onTrendlineDelete(selectedTrendlineId);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTrendlineId, onTrendlineDelete]);

  // Attach one primitive per trendline; re-syncs on data/selection/theme change.
  React.useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    primitivesRef.current.forEach((primitive) => series.detachPrimitive(primitive));
    primitivesRef.current.clear();

    trendlines.forEach((trendline) => {
      const primitive = new TrendlinePrimitive(trendline, colors.trendlineColor);
      primitive.selected = trendline.id === selectedTrendlineId;
      series.attachPrimitive(primitive);
      primitivesRef.current.set(trendline.id, primitive);
    });
  }, [trendlines, selectedTrendlineId, colors.trendlineColor, chartVersion]);

  // Compare overlay: a second line series on its own independent right-side
  // price scale. Created/destroyed only when the compared *symbol* changes
  // (a stable primitive) — not on every `compareData` prop change, which is
  // a fresh object every time the parent re-renders (timeframe switches
  // trigger several: the main query's loading→success, then the compare
  // query's own loading→success). Recreating the series that often used to
  // hit the same lightweight-charts crash already fixed for the MA overlays
  // above ("Value is undefined" in ensureDefined, from a stale series
  // reference briefly outliving a torn-down one) — most visible right after
  // a timeframe change in compare mode, which is exactly when this fired
  // rapidly. Data itself is pushed by a separate effect below, same split
  // as the MA overlays use.
  const compareSymbol = compareData?.symbol ?? null;
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !compareSymbol) return;

    const compareSeries = chart.addSeries(LineSeries, {
      color: colors.compareColor,
      lineWidth: 2,
      priceScaleId: 'compare-right',
    });
    chart.priceScale('compare-right').applyOptions({
      borderColor: colors.border,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    });
    compareSeriesRef.current = compareSeries;

    return () => {
      chart.removeSeries(compareSeries);
      compareSeriesRef.current = null;
    };
  }, [compareSymbol, chartVersion, colors.compareColor, colors.border]);

  // Push compare series data whenever it changes, without recreating the series.
  React.useEffect(() => {
    const series = compareSeriesRef.current;
    if (!series || !compareData) return;
    try {
      series.setData(
        toSortedSeriesData(
          compareData.data
            .filter((d) => Number.isFinite(d.price))
            .map((d) => ({ time: toUtcTimestamp(d.date), value: d.price }))
        )
      );
    } catch (err) {
      console.error('PriceChart: failed to update compare series, leaving prior chart state in place', err);
    }
  }, [compareData, chartVersion]);

  // Which arrow direction(s) are currently held, and at what speed — read by
  // the rAF loop below, written only by the keyboard handlers. Kept in refs
  // rather than state: the loop reads and repaints the chart imperatively
  // every frame, and routing that through state would re-render the whole
  // component 60+ times a second.
  const heldPanDirectionsRef = React.useRef<Set<-1 | 1>>(new Set());
  const panFastRef = React.useRef(false);
  const panVelocityRef = React.useRef(0); // window-fractions per second, signed
  const panFrameRef = React.useRef<number | null>(null);
  const panLastTimeRef = React.useRef(0);

  // Stops the animation only — the held-direction set is left alone, so a
  // key physically still held resumes on its very next (real, OS-timed)
  // repeat event. Used where the range is being repositioned some other way
  // (zoom, reset, a chart recreate) and a coasting glide would fight it.
  const stopPanMotion = React.useCallback(() => {
    if (panFrameRef.current !== null) cancelAnimationFrame(panFrameRef.current);
    panFrameRef.current = null;
    panVelocityRef.current = 0;
  }, []);

  // Full stop: also forgets which keys are held, for when a keyup may never
  // arrive to clear them (focus leaving the chart, or the tab losing focus
  // entirely while a key is down).
  const releaseAllPanKeys = React.useCallback(() => {
    heldPanDirectionsRef.current.clear();
    stopPanMotion();
  }, [stopPanMotion]);

  const handleResetZoom = React.useCallback(() => {
    stopPanMotion();
    chartRef.current?.timeScale().fitContent();
  }, [stopPanMotion]);

  // How many bars the active series holds — the bound both the zoom and the
  // pan clamp against, so neither can leave the series off-screen.
  const barCount = chartType === 'candlestick' ? candlestickData.length : lineData.length;

  // lightweight-charts deliberately keeps its navigation UI minimal. These
  // controls make the otherwise-hidden zoom gesture discoverable, work on
  // touch devices, and give keyboard users an equivalent interaction.
  //
  // The span is clamped at both ends. Repeated zoom-in ran the visible range
  // down towards zero bars, and repeated zoom-out shrank the series into an
  // unreadable sliver mid-pane; both were dead ends you could only leave via
  // the reset button.
  const handleZoom = React.useCallback(
    (factor: number) => {
      const timeScale = chartRef.current?.timeScale();
      const range = timeScale?.getVisibleLogicalRange();
      if (!timeScale || !range) return;

      stopPanMotion();
      const minSpan = Math.min(MIN_VISIBLE_BARS, barCount);
      const maxSpan = Math.max(barCount, minSpan);
      const span = Math.min(Math.max((range.to - range.from) * factor, minSpan), maxSpan);
      const center = (range.from + range.to) / 2;
      timeScale.setVisibleLogicalRange({ from: center - span / 2, to: center + span / 2 });
    },
    [barCount, stopPanMotion]
  );

  // The continuous pan loop. Runs for as long as a direction is held (or
  // until its coast-to-stop settles after release), independent of how often
  // — or whether at all, past the first press — keydown fires. Velocity
  // chases its target (full speed while held, zero once released) with the
  // same exponential ease used for the earlier position-based glide, just
  // applied one derivative up; integrating it every frame is what makes an
  // arbitrarily long hold read as one continuous motion instead of a chain of
  // discrete steps.
  const stepPan = React.useCallback(
    (now: number) => {
      const timeScale = chartRef.current?.timeScale();
      const range = timeScale?.getVisibleLogicalRange();
      if (!timeScale || !range) {
        panFrameRef.current = null;
        return;
      }

      const elapsedMs = Math.min(now - panLastTimeRef.current, MAX_PAN_FRAME_MS);
      panLastTimeRef.current = now;

      const directions = heldPanDirectionsRef.current;
      const net = (directions.has(1) ? 1 : 0) - (directions.has(-1) ? 1 : 0);
      const maxSpeed = PAN_SPEED_WINDOWS_PER_SEC * (panFastRef.current ? PAN_FAST_SPEED_MULTIPLIER : 1);
      const targetVelocity = net * maxSpeed;

      const alpha = 1 - Math.exp(-elapsedMs / PAN_VELOCITY_TIME_CONSTANT_MS);
      panVelocityRef.current += (targetVelocity - panVelocityRef.current) * alpha;

      if (net === 0 && Math.abs(panVelocityRef.current) < PAN_VELOCITY_EPSILON) {
        panVelocityRef.current = 0;
        panFrameRef.current = null;
        return;
      }

      const span = range.to - range.from;
      const deltaBars = panVelocityRef.current * (elapsedMs / 1000) * span;
      // Keep at least half the window over real bars, so a hold can't strand
      // the view in the empty space either side of the series.
      const from = Math.min(Math.max(range.from + deltaBars, -span / 2), barCount - span / 2);
      timeScale.setVisibleLogicalRange({ from, to: from + span });

      panFrameRef.current = requestAnimationFrame(stepPan);
    },
    [barCount]
  );

  const ensurePanLoopRunning = React.useCallback(() => {
    if (panFrameRef.current === null) {
      panLastTimeRef.current = performance.now();
      panFrameRef.current = requestAnimationFrame(stepPan);
    }
  }, [stepPan]);

  // An instant, unanimated nudge — the reduced-motion equivalent of holding
  // an arrow, since there is no glide to hold "into". Shift still means "go
  // further", matching what it means for the animated glide.
  const applyInstantPan = React.useCallback(
    (direction: number, fraction: number) => {
      const timeScale = chartRef.current?.timeScale();
      const range = timeScale?.getVisibleLogicalRange();
      if (!timeScale || !range) return;
      const span = range.to - range.from;
      const from = Math.min(Math.max(range.from + span * fraction * direction, -span / 2), barCount - span / 2);
      timeScale.setVisibleLogicalRange({ from, to: from + span });
    },
    [barCount]
  );

  // A chart recreate (theme or series-type switch) — and unmount — leaves any
  // in-flight glide aimed at a logical range that no longer means anything.
  // The held-key state itself is left alone: the same DOM node stays
  // mounted, so a key still physically down keeps working once the new
  // chart is up, picked up by that key's next real repeat event.
  React.useEffect(() => stopPanMotion, [chartVersion, stopPanMotion]);

  // Safety net for keyup never arriving: if the tab loses focus while a key
  // is held, no keyup fires on return, and the chart would otherwise resume
  // "holding" that direction as soon as it's focused again.
  React.useEffect(() => {
    window.addEventListener('blur', releaseAllPanKeys);
    return () => window.removeEventListener('blur', releaseAllPanKeys);
  }, [releaseAllPanKeys]);

  const handleChartKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Let the visible controls retain their normal keyboard behavior.
      if (event.target !== event.currentTarget) return;

      switch (event.key) {
        case '+':
        case '=':
          handleZoom(ZOOM_IN_FACTOR);
          break;
        case '-':
        case '_':
          handleZoom(ZOOM_OUT_FACTOR);
          break;
        case 'ArrowLeft':
        case 'ArrowRight': {
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          if (prefersReducedMotion()) {
            applyInstantPan(direction, event.shiftKey ? 1 : 0.25);
          } else {
            panFastRef.current = event.shiftKey;
            heldPanDirectionsRef.current.add(direction);
            ensurePanLoopRunning();
          }
          break;
        }
        case '0':
        case 'Home':
          handleResetZoom();
          break;
        default:
          // Anything else keeps its default behaviour (tabbing out included).
          return;
      }
      event.preventDefault();
    },
    [applyInstantPan, ensurePanLoopRunning, handleResetZoom, handleZoom]
  );

  // Releases a held direction on keyup, so the loop coasts to a stop rather
  // than panning forever once the last real key-repeat event has passed.
  const handleChartKeyUp = React.useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') heldPanDirectionsRef.current.delete(-1);
    else if (event.key === 'ArrowRight') heldPanDirectionsRef.current.delete(1);
  }, []);

  if ((chartType === 'candlestick' && candlestickData.length === 0) || (chartType === 'line' && lineData.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto bg-muted/50 rounded-full flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {chartType === 'candlestick' ? 'No OHLC data available for candlestick chart' : 'No data available'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full bg-card overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${bordered ? 'rounded-lg border border-border/50' : ''}`}
      tabIndex={0}
      role="application"
      onKeyDown={handleChartKeyDown}
      onKeyUp={handleChartKeyUp}
      // Losing focus mid-hold is the one path a keyup can't be relied on to
      // cover (e.g. clicking straight from a held arrow onto another
      // control) — stop outright rather than leave the loop running.
      onBlur={releaseAllPanKeys}
      // Double-click to reset is the near-universal chart idiom, and costs no
      // screen space. Suppressed while drawing, where a double-click is two
      // meaningful trendline clicks rather than one gesture.
      onDoubleClick={trendlinesEnabled ? undefined : handleResetZoom}
      aria-label={`${commodityName} price chart. Arrow keys pan, plus and minus zoom, zero resets the visible range.`}
      aria-keyshortcuts="ArrowLeft ArrowRight + - 0"
    >
      {/* Legend — one consolidated block rather than a separately-bordered
          chip per piece of info. Compare + MA together used to stack 3-4
          individually-bordered/backdrop-blurred boxes down the top-left
          corner, eating a big chunk of a now-shorter chart; this is one box
          with internal rows instead. */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 max-w-[75%]">
        <div className="flex flex-col gap-0.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 border border-border/50">
          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isPositiveTrend ? colors.upColor : colors.downColor }} />
              {commodityName}
            </span>
            {compareData && (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors.compareColor }} />
                {compareData.symbol}
                {onCompareRemove && (
                  <button onClick={onCompareRemove} className="text-muted-foreground hover:text-foreground" aria-label="Remove compare series">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            )}
          </div>
          {maData.some((ma) => ma.data.length > 0) && (
            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-2xs font-medium pt-0.5 border-t border-border/30">
              {maData.map((ma, i) =>
                ma.data.length > 0 ? (
                  <span key={ma.period} style={{ color: MA_COLORS[i % MA_COLORS.length] }}>
                    MA{ma.period}: {formatPrice(ma.data[ma.data.length - 1].value)}
                  </span>
                ) : null
              )}
            </div>
          )}
        </div>
        {trendlinesEnabled && (
          <div className="bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 border border-border/50 text-2xs text-muted-foreground">
            {pendingPoint ? 'Click to set the second point (Esc to cancel)' : 'Click to start a trendline'}
          </div>
        )}
      </div>

      {/* Zoom/reset — icon-only, so each needs a tooltip/aria-label to be
          discoverable at all; there was previously no way to tell what these
          buttons did without clicking one first. The tooltips double as the
          only place the keyboard shortcuts are advertised. */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleZoom(ZOOM_IN_FACTOR)}
                aria-label="Zoom in"
                className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm hover:bg-muted/80 border border-border/50"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom in (+)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleZoom(ZOOM_OUT_FACTOR)}
                aria-label="Zoom out"
                className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm hover:bg-muted/80 border border-border/50"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Zoom out (−)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetZoom}
                aria-label="Reset zoom and pan"
                className="h-8 w-8 p-0 bg-background/80 backdrop-blur-sm hover:bg-muted/80 border border-border/50"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Reset zoom &amp; pan (0, or double-click)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div ref={containerRef} className="w-full h-full" />

      {tooltip && (
        <div
          className="absolute z-20 bg-background/95 backdrop-blur-sm border border-border/50 rounded-xl p-3 shadow-xl pointer-events-none text-xs max-w-[220px]"
          style={{
            // 228 = the box's 220px max-width plus an 8px margin; the outer
            // max() keeps it on-screen when the chart is narrower than that.
            left: Math.max(8, Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 228)),
            top: Math.max(tooltip.y - 90, 4),
          }}
        >
          <div className="text-sm font-semibold text-foreground mb-2">{formatTooltipLabel(tooltip.dateIso)}</div>
          {chartType === 'candlestick' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Open:</span>
                <span className="font-medium tabular-nums">{formatPrice(tooltip.open ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Close:</span>
                <span className="font-medium tabular-nums">{formatPrice(tooltip.close ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">High:</span>
                <span className="font-medium tabular-nums" style={{ color: colors.upColor }}>{formatPrice(tooltip.high ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Low:</span>
                <span className="font-medium tabular-nums" style={{ color: colors.downColor }}>{formatPrice(tooltip.low ?? 0)}</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Price:</span>
              <span className="font-medium tabular-nums">{formatPrice(tooltip.value ?? 0)}</span>
            </div>
          )}
          {compareData && tooltip.compareValue !== undefined && (
            <div className="flex justify-between gap-2 mt-1 pt-1 border-t border-border/30">
              <span className="text-muted-foreground">{compareData.symbol}:</span>
              <span className="font-medium tabular-nums">{formatCommodityPrice(tooltip.compareValue, compareData.symbol)}</span>
            </div>
          )}
          {tooltip.volume !== undefined && (
            <div className="flex justify-between gap-2 mt-1 pt-1 border-t border-border/30">
              <span className="text-muted-foreground">Vol:</span>
              <span className="font-medium tabular-nums">{formatVolume(tooltip.volume)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PriceChart;
