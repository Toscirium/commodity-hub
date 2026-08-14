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
import { TrendingUp, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice as formatCommodityPrice } from '@/lib/commodityUtils';
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
}

type MainSeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Area'>;

// Distinct from trendlineColor (purple) and compareColor (amber) so all the
// overlays stay visually separable on the same chart.
const MA_COLORS = ['#f97316', '#eab308', '#6366f1'];

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
  }, [chartType, isDark]);

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

  // Compare overlay: a second line series on its own independent right-side price scale.
  React.useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !compareData) return;

    const compareSeries = chart.addSeries(LineSeries, {
      color: colors.compareColor,
      lineWidth: 2,
      priceScaleId: 'compare-right',
    });
    chart.priceScale('compare-right').applyOptions({
      borderColor: colors.border,
      scaleMargins: { top: 0.1, bottom: 0.1 },
    });
    try {
      compareSeries.setData(
        toSortedSeriesData(
          compareData.data
            .filter((d) => Number.isFinite(d.price))
            .map((d) => ({ time: toUtcTimestamp(d.date), value: d.price }))
        )
      );
    } catch (err) {
      console.error('PriceChart: failed to update compare series, leaving prior chart state in place', err);
    }
    compareSeriesRef.current = compareSeries;

    return () => {
      chart.removeSeries(compareSeries);
      compareSeriesRef.current = null;
    };
    // The MA overlay effect above follows this same attach/detach shape, but
    // omits priceScaleId so it shares the main price scale instead of getting
    // its own, and its data is computed client-side rather than fetched.
  }, [compareData, chartVersion, colors.compareColor, colors.border]);

  const handleResetZoom = () => chartRef.current?.timeScale().fitContent();

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
      className={`relative w-full h-full bg-card overflow-hidden ${bordered ? 'rounded-lg border border-border/50' : ''}`}
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

      {/* Reset zoom */}
      <div className="absolute top-2 right-2 z-10">
        <Button variant="ghost" size="sm" onClick={handleResetZoom} className="h-7 w-7 p-0 bg-background/80 backdrop-blur-sm hover:bg-muted/80 border border-border/50">
          <RotateCcw className="h-3 w-3" />
        </Button>
      </div>

      <div ref={containerRef} className="w-full h-full" />

      {tooltip && (
        <div
          className="absolute z-20 bg-background/95 backdrop-blur-sm border border-border/50 rounded-xl p-3 shadow-xl pointer-events-none text-xs max-w-[220px]"
          style={{
            left: Math.min(tooltip.x + 12, (containerRef.current?.clientWidth ?? 0) - 190),
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
