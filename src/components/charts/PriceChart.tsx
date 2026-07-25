import React from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { TrendingUp, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice as formatCommodityPrice } from '@/lib/commodityUtils';
import { useIsDarkMode, getLightweightChartColors, toUtcTimestamp } from './lightweightChartTheme';
import { TrendlinePrimitive } from './trendlinePrimitive';
import type { Trendline, TrendlinePoint } from '@/hooks/useTrendlines';

export interface PriceChartCompareData {
  symbol: string;
  data: { date: string; price: number }[];
}

interface PriceChartProps {
  lineData: { date: string; price: number }[];
  candlestickData: { date: string; open: number; high: number; low: number; close: number }[];
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
}

type MainSeries = ISeriesApi<'Candlestick'> | ISeriesApi<'Line'>;

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
}

const PriceChart: React.FC<PriceChartProps> = ({
  lineData,
  candlestickData,
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
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<MainSeries | null>(null);
  const compareSeriesRef = React.useRef<ISeriesApi<'Line'> | null>(null);
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
      layout: { background: { color: colors.background }, textColor: colors.text },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: Time) => formatXAxisTick(new Date((time as number) * 1000).toISOString()),
      },
      rightPriceScale: { borderColor: colors.border },
      localization: { priceFormatter: (price: number) => formatPrice(price) },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series: MainSeries =
      chartType === 'candlestick'
        ? chart.addSeries(CandlestickSeries, {
            upColor: colors.upColor,
            downColor: colors.downColor,
            wickUpColor: colors.wickUpColor,
            wickDownColor: colors.wickDownColor,
            borderUpColor: colors.wickUpColor,
            borderDownColor: colors.wickDownColor,
          })
        : chart.addSeries(LineSeries, {
            color: isPositiveTrend ? colors.upColor : colors.downColor,
            lineWidth: 2,
          });

    chartRef.current = chart;
    seriesRef.current = series;
    compareSeriesRef.current = null;
    primitives.clear();
    setChartVersion((v) => v + 1);

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      compareSeriesRef.current = null;
      primitives.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, isDark]);

  // Keep the line-series color in sync with trend direction without a full chart recreate.
  React.useEffect(() => {
    if (chartType !== 'line' || !seriesRef.current) return;
    (seriesRef.current as ISeriesApi<'Line'>).applyOptions({
      color: isPositiveTrend ? colors.upColor : colors.downColor,
    });
  }, [isPositiveTrend, chartType, colors, chartVersion]);

  // Push main series data.
  React.useEffect(() => {
    if (!seriesRef.current) return;
    if (chartType === 'candlestick') {
      (seriesRef.current as ISeriesApi<'Candlestick'>).setData(
        candlestickData.map((d) => ({
          time: toUtcTimestamp(d.date),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );
    } else {
      (seriesRef.current as ISeriesApi<'Line'>).setData(
        lineData.map((d) => ({ time: toUtcTimestamp(d.date), value: d.price }))
      );
    }
    chartRef.current?.timeScale().fitContent();
  }, [chartType, candlestickData, lineData, chartVersion]);

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
    compareSeries.setData(compareData.data.map((d) => ({ time: toUtcTimestamp(d.date), value: d.price })));
    compareSeriesRef.current = compareSeries;

    return () => {
      chart.removeSeries(compareSeries);
      compareSeriesRef.current = null;
    };
    // A future same-scale indicator overlay (e.g. SMA) would follow this exact
    // attach/detach pattern, but omit priceScaleId so it shares the main scale,
    // and compute its data client-side instead of fetching a second symbol.
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
    <div className="relative w-full h-full bg-card rounded-lg border border-border/50 overflow-hidden">
      {/* Legend */}
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 border border-border/50 text-xs font-medium">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isPositiveTrend ? colors.upColor : colors.downColor }} />
          {commodityName}
        </div>
        {compareData && (
          <div className="flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded-md px-2 py-1 border border-border/50 text-xs font-medium">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.compareColor }} />
            {compareData.symbol}
            {onCompareRemove && (
              <button onClick={onCompareRemove} className="ml-1 text-muted-foreground hover:text-foreground" aria-label="Remove compare series">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
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
        </div>
      )}
    </div>
  );
};

export default PriceChart;
