import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCommodityHistoricalData, useCommodityPrice } from '@/hooks/useCommodityData';
import { useTrendlines } from '@/hooks/useTrendlines';
import { useIsMobile } from '@/hooks/use-mobile';
import { smoothPriceData, TIMEFRAMES } from './charts/chartUtils';
import ChartHeader from './charts/ChartHeader';
import ChartToolbar from './charts/ChartToolbar';
import ChartContainer from './charts/ChartContainer';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { formatPrice as formatCommodityPrice } from '@/lib/commodityUtils';
import CurrencySelector from './CurrencySelector';
import { Toggle } from '@/components/ui/toggle';
import { X, ChartCandlestick, AlertTriangle } from 'lucide-react';

// A chart-rendering bug (e.g. a charting-library assertion failure) should
// take down this one chart, not the whole app — there's no boundary above
// this in the tree, so an uncaught error here otherwise unmounts everything.
// Keyed by timeframe/type at each call site so switching away from whatever
// triggered it gets a fresh mount instead of staying stuck on the fallback.
const ChartErrorFallback = () => (
  <div className="flex items-center justify-center h-full text-center p-4">
    <div className="space-y-2">
      <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
      <p className="text-sm text-muted-foreground">Chart failed to render. Try a different timeframe.</p>
    </div>
  </div>
);

interface FuturesContract {
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  category: string;
  contractSize: string;
  venue: string;
  supportedByFMP: boolean;
  expirationDate?: string;
  source?: string;
}

interface CommodityChartProps {
  name: string;
  basePrice: number;
  selectedContract?: string;
  contractData?: FuturesContract;
}

const CommodityChart = ({ name, basePrice, selectedContract, contractData }: CommodityChartProps) => {
  const [selectedTimeframe, setSelectedTimeframe] = React.useState<string>('1m');
  const [chartType, setChartType] = React.useState<'line' | 'candlestick'>('line');
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const [trendlineMode, setTrendlineMode] = React.useState(false);
  const [trendlineDrawPending, setTrendlineDrawPending] = React.useState(false);
  const [compareSymbol, setCompareSymbol] = React.useState<string | null>(null);
  const isMobile = useIsMobile();

  const { data: queryData, isLoading: loading, error: queryError } = useCommodityHistoricalData(name, selectedTimeframe, chartType, selectedContract);
  const { data: currentPrice } = useCommodityPrice(name);
  const { data: compareQueryData } = useCommodityHistoricalData(compareSymbol ?? '', selectedTimeframe, 'line');
  const { trendlines, addTrendline, removeTrendline, clearTrendlines, selectedId, setSelectedId } = useTrendlines(name);

  // Trendlines/compare are session-scoped per commodity — don't leak across navigation.
  React.useEffect(() => {
    setCompareSymbol(null);
    setTrendlineMode(false);
  }, [name]);

  // Detect orientation changes
  React.useEffect(() => {
    const checkOrientation = () => {
      const isLandscapeMode = window.innerWidth > window.innerHeight && isMobile;

      // Auto full-screen on landscape for mobile - immediate response
      if (isLandscapeMode && isMobile) {
        setIsFullScreen(true);
      } else if (!isLandscapeMode) {
        setIsFullScreen(false);
      }
    };

    // Immediate check on mount
    checkOrientation();
    
    // Use screen.orientation for immediate response
    const handleOrientationChange = () => {
      // Small delay only for resize to prevent layout thrashing
      setTimeout(checkOrientation, 50);
    };

    window.addEventListener('resize', handleOrientationChange);
    window.addEventListener('orientationchange', checkOrientation); // Immediate for orientation change
    
    // Also listen for screen orientation changes if available - immediate response
    if (screen.orientation) {
      screen.orientation.addEventListener('change', checkOrientation);
    }

    return () => {
      window.removeEventListener('resize', handleOrientationChange);
      window.removeEventListener('orientationchange', checkOrientation);
      if (screen.orientation) {
        screen.orientation.removeEventListener('change', checkOrientation);
      }
    };
  }, [isMobile]);

  // Handle escape key to exit full screen — deferred while a trendline draw is in
  // progress, so Escape cancels the pending line first rather than also exiting.
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen && !trendlineDrawPending) {
        setIsFullScreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isFullScreen, trendlineDrawPending]);

  // Prevent body scroll when full screen
  React.useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isFullScreen]);

  // Extract data from query result
  const data = queryData?.data || [];
  const error = queryError?.message || queryData?.error || null;
  const ohlcAvailable = !!queryData?.ohlcAvailable;

  // Auto-revert to line chart if the active dataset can't support candles.
  React.useEffect(() => {
    if (chartType === 'candlestick' && !loading && !ohlcAvailable && data.length > 0) {
      setChartType('line');
    }
  }, [chartType, loading, ohlcAvailable, data.length]);
  
  // Use smoothed data for trend calculation to avoid spiky data issues
  const trendData = chartType === 'line' ? smoothPriceData(data, name) : data;
  
  // Use current price from API if available, otherwise use base price
  const displayPrice = currentPrice?.price || basePrice;
  const isPositiveTrend = trendData.length > 1 && trendData[trendData.length - 1].price > trendData[0].price;

  // Calculate price change using smoothed data
  const priceChange = trendData.length > 1 ?
    ((trendData[trendData.length - 1].price - trendData[0].price) / trendData[0].price) * 100 : 0;

  const compareData = compareSymbol && compareQueryData?.data?.length
    ? { symbol: compareSymbol, data: compareQueryData.data }
    : null;

  // Full-screen overlay — in practice this only ever renders in mobile
  // landscape (see the orientation effect above), so it's built as a lean,
  // trading-app-style view: one slim identity bar above the chart, one slim
  // timeframe strip below it (not stacked together — that's what made the
  // timeframe row hard to hit, jammed right under the close button with no
  // account for the device's overlaid status bar), and the chart itself
  // takes essentially all remaining height in between.
  if (isFullScreen) {
    return (
      // Side padding clears a landscape notch/camera cutout — env() resolves to
      // 0 when there isn't one, so this is a no-op on ordinary devices/web.
      <div
        className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden"
        style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}
      >
        {/* Identity bar: close, name + price + change, then the secondary
            controls (currency/candle/trendline/compare). Padded below
            var(--app-top-buffer) so it isn't obscured by Android's overlaid
            status bar (same variable src/index.css's .app-top-bar uses) —
            the previous version had no top-safe-area padding at all, which
            is what made this row (and the timeframe row that used to sit
            directly under it) hard to hit on a real device. */}
        <div
          className="flex items-center gap-1.5 px-2 pb-1.5 border-b bg-background shrink-0"
          style={{ paddingTop: 'calc(var(--app-top-buffer, 0px) + 0.375rem)' }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsFullScreen(false)}
            className="h-8 w-8 shrink-0"
            aria-label="Exit full-screen chart"
          >
            <X className="w-4 h-4" />
          </Button>
          <div className="flex items-baseline gap-2 min-w-0 flex-1">
            <span className="text-sm font-bold text-foreground truncate">{name}</span>
            {displayPrice != null && (
              <span className="text-sm font-semibold text-foreground number-display tabular-nums shrink-0">
                {formatCommodityPrice(displayPrice, name, 2, false)}
              </span>
            )}
            {trendData.length > 1 && (
              <span
                className={`text-xs font-semibold number-display shrink-0 ${
                  isPositiveTrend ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'
                }`}
              >
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            )}
          </div>
          <ChartToolbar
            compact
            trendlineMode={trendlineMode}
            onTrendlineModeChange={setTrendlineMode}
            trendlineCount={trendlines.length}
            onClearTrendlines={clearTrendlines}
            compareSymbol={compareSymbol}
            onCompareSymbolChange={setCompareSymbol}
            currentSymbol={name}
          />
          <CurrencySelector compact />
          <Toggle
            pressed={chartType === 'candlestick' && ohlcAvailable}
            onPressedChange={(pressed) => setChartType(pressed ? 'candlestick' : 'line')}
            disabled={!ohlcAvailable}
            aria-label="Toggle candlestick chart"
            size="sm"
            className="data-[state=on]:bg-primary/20 data-[state=on]:text-primary disabled:opacity-40 shrink-0"
          >
            <ChartCandlestick className="w-4 h-4" />
          </Toggle>
        </div>

        {/* Chart — the identity bar above and the timeframe strip below are
            the only chrome; this gets everything else, sized purely by the
            flex chain (flex-1 min-h-0 → h-full) rather than a fixed
            viewport calc, so it's always exactly "whatever's left". */}
        <div className="flex-1 min-h-0 p-1">
          <ErrorBoundary key={`${selectedTimeframe}-${chartType}`} fallback={<ChartErrorFallback />}>
            <ChartContainer
              data={data}
              name={name}
              selectedTimeframe={selectedTimeframe}
              chartType={chartType}
              loading={loading}
              error={error}
              isPositiveTrend={isPositiveTrend}
              compareData={compareData}
              onCompareRemove={() => setCompareSymbol(null)}
              trendlinesEnabled={trendlineMode}
              trendlines={trendlines}
              selectedTrendlineId={selectedId}
              onTrendlineCreate={(p1, p2) => addTrendline(p1, p2)}
              onTrendlineSelect={setSelectedId}
              onTrendlineDelete={removeTrendline}
              onPendingTrendlineChange={setTrendlineDrawPending}
            />
          </ErrorBoundary>
        </div>

        {/* Timeframe strip — dedicated row, nothing else competing for tap
            space (trendline/compare live in the identity bar instead), and
            anchored at the bottom edge, away from the status-bar corner
            where the overlap was actually happening. Padded above
            safe-area-inset-bottom for devices with a gesture nav bar. */}
        <div
          className="flex items-center gap-1.5 px-2 pt-1.5 border-t bg-background/95 shrink-0 overflow-x-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.375rem)' }}
        >
          {TIMEFRAMES.map((tf) => (
            <Button
              key={tf.value}
              variant={selectedTimeframe === tf.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedTimeframe(tf.value)}
              disabled={loading}
              className={`h-8 px-3 text-xs font-semibold shrink-0 ${
                selectedTimeframe === tf.value
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf.label}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Regular chart component
  return (
    <Card className="box-border p-3 sm:p-6 mt-4 sm:mt-6 w-full min-w-0 max-w-full overflow-hidden bg-card border border-border animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 w-full min-w-0 max-w-full overflow-hidden">
        <ChartHeader
          name={name}
          selectedTimeframe={selectedTimeframe}
          onTimeframeChange={setSelectedTimeframe}
          chartType={chartType}
          onChartTypeChange={setChartType}
          dataPoints={data.length}
          loading={loading}
          isPositiveTrend={isPositiveTrend}
          priceChange={priceChange}
          ohlcAvailable={ohlcAvailable}
        />

      </div>

      <ChartToolbar
        trendlineMode={trendlineMode}
        onTrendlineModeChange={setTrendlineMode}
        trendlineCount={trendlines.length}
        onClearTrendlines={clearTrendlines}
        compareSymbol={compareSymbol}
        onCompareSymbolChange={setCompareSymbol}
        currentSymbol={name}
      />

      {/* About a third of the viewport height, edge-to-edge — negative
          margins cancel exactly the Card's own p-3/sm:p-6 so the chart
          bleeds flush to the card's edges instead of sitting in a bordered,
          padded box (the Card has overflow-hidden, so this can't leak past
          the card itself). Matches a dedicated trading app's chart, which
          is never boxed in with a border/background of its own. */}
      <div className="h-[33vh] min-h-[240px] max-h-[480px] -mx-3 sm:-mx-6 overflow-hidden">
        <ErrorBoundary key={`${selectedTimeframe}-${chartType}`} fallback={<ChartErrorFallback />}>
          <ChartContainer
            data={data}
            name={name}
            selectedTimeframe={selectedTimeframe}
            chartType={chartType}
            loading={loading}
            error={error}
            isPositiveTrend={isPositiveTrend}
            compareData={compareData}
            onCompareRemove={() => setCompareSymbol(null)}
            trendlinesEnabled={trendlineMode}
            trendlines={trendlines}
            bordered={false}
            selectedTrendlineId={selectedId}
            onTrendlineCreate={(p1, p2) => addTrendline(p1, p2)}
            onTrendlineSelect={setSelectedId}
            onTrendlineDelete={removeTrendline}
            onPendingTrendlineChange={setTrendlineDrawPending}
          />
        </ErrorBoundary>
      </div>
    </Card>
  );
};

export default CommodityChart;