import React from 'react';
import { Loader, AlertCircle } from 'lucide-react';
import { CommodityHistoricalData } from '@/hooks/useCommodityData';
import { isCentPriced } from '@/lib/commodityUtils';
import { formatXAxisTick, formatTooltipLabel, smoothPriceData, calculateSMA } from './chartUtils';
import PriceChart, { type PriceChartCompareData } from './PriceChart';
import { useCurrency } from '@/hooks/useCurrency';
import type { Trendline, TrendlinePoint } from '@/hooks/useTrendlines';

interface ChartContainerProps {
  data: CommodityHistoricalData[];
  name: string;
  selectedTimeframe: string;
  chartType: 'line' | 'candlestick';
  loading: boolean;
  error: string | null;
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

const ChartContainer: React.FC<ChartContainerProps> = ({
  data,
  name,
  selectedTimeframe,
  chartType,
  loading,
  error,
  isPositiveTrend,
  compareData,
  onCompareRemove,
  trendlinesEnabled,
  trendlines,
  selectedTrendlineId,
  onTrendlineCreate,
  onTrendlineSelect,
  onTrendlineDelete,
  onPendingTrendlineChange,
}) => {
  const { selectedCurrency, convertPrice, currencyInfo } = useCurrency();
  const isCent = isCentPriced(name) && selectedCurrency === 'USD';
  const formatPrice = React.useCallback(
    (value: number) => (isCent ? `${value.toFixed(1)}¢` : `${currencyInfo.symbol}${value.toFixed(2)}`),
    [isCent, currencyInfo.symbol]
  );

  // Convert data prices to selected currency
  const convertedData = React.useMemo(() => {
    if (selectedCurrency === 'USD') return data;
    return data.map(item => ({
      ...item,
      price: convertPrice(item.price),
      ...(item.open !== undefined && { open: convertPrice(item.open) }),
      ...(item.high !== undefined && { high: convertPrice(item.high) }),
      ...(item.low !== undefined && { low: convertPrice(item.low) }),
      ...(item.close !== undefined && { close: convertPrice(item.close) }),
    }));
  }, [data, selectedCurrency, convertPrice]);

  // Apply data smoothing only for line charts
  const smoothedData = chartType === 'line' ? smoothPriceData(convertedData, name) : convertedData;

  const filteredOhlcData = React.useMemo(
    () =>
      convertedData.filter(
        (item): item is CommodityHistoricalData & { open: number; high: number; low: number; close: number } =>
          typeof item.open === 'number' &&
          typeof item.high === 'number' &&
          typeof item.low === 'number' &&
          typeof item.close === 'number'
      ),
    [convertedData]
  );

  // Volume bars — colored per-bar the same way most trading charts do: green
  // when that bar closed up (vs. its own open, or vs. the prior close when
  // there's no open/close split for this series), red otherwise.
  const volumeData = React.useMemo(
    () =>
      convertedData
        .filter((item): item is CommodityHistoricalData & { volume: number } => typeof item.volume === 'number')
        .map((item, index, arr) => ({
          date: item.date,
          value: item.volume,
          up:
            typeof item.open === 'number' && typeof item.close === 'number'
              ? item.close >= item.open
              : index === 0 || item.price >= arr[index - 1].price,
        })),
    [convertedData]
  );

  // Moving averages, computed from closing price regardless of chart type —
  // smoothedData already resolves to "price = close" for candlestick data.
  const maData = React.useMemo(() => {
    const closes = smoothedData.map((d) => ({ date: d.date, price: d.price }));
    return [5, 10, 20].map((period) => ({ period, data: calculateSMA(closes, period) }));
  }, [smoothedData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading market data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-600 dark:text-red-400 mb-2">
            Unable to load real market data
          </p>
          <p className="text-xs text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground mt-1">Using fallback data</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No data available</p>
        </div>
      </div>
    );
  }

  return (
    <PriceChart
      lineData={smoothedData}
      candlestickData={filteredOhlcData}
      volumeData={volumeData}
      maData={maData}
      chartType={chartType}
      formatXAxisTick={(date) => formatXAxisTick(date, selectedTimeframe)}
      formatTooltipLabel={(label) => formatTooltipLabel(label, selectedTimeframe)}
      formatPrice={formatPrice}
      commodityName={name}
      isPositiveTrend={isPositiveTrend}
      compareData={compareData}
      onCompareRemove={onCompareRemove}
      trendlinesEnabled={trendlinesEnabled}
      trendlines={trendlines}
      selectedTrendlineId={selectedTrendlineId}
      onTrendlineCreate={onTrendlineCreate}
      onTrendlineSelect={onTrendlineSelect}
      onTrendlineDelete={onTrendlineDelete}
      onPendingTrendlineChange={onPendingTrendlineChange}
    />
  );
};

export default ChartContainer;
