import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCommodityHistoricalData, useCommodityPrice } from '@/hooks/useCommodityData';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { smoothPriceData } from './charts/chartUtils';
import ChartHeader from './charts/ChartHeader';
import ChartContainer from './charts/ChartContainer';
import ChartFooter from './charts/ChartFooter';
import { X, Maximize2, BarChart3 } from 'lucide-react';

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
  const [isLandscape, setIsLandscape] = React.useState(false);
  const isMobile = useIsMobile();
  
  const { data: queryData, isLoading: loading, error: queryError } = useCommodityHistoricalData(name, selectedTimeframe, chartType, selectedContract);
  const { data: currentPrice } = useCommodityPrice(name);
  const { profile } = useAuth();

  // Detect orientation changes
  React.useEffect(() => {
    const checkOrientation = () => {
      const isLandscapeMode = window.innerWidth > window.innerHeight && isMobile;
      setIsLandscape(isLandscapeMode);
      
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

  // Handle escape key to exit full screen
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isFullScreen]);

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

  const isPremium = profile?.subscription_active && profile?.subscription_tier === 'premium';
  
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

  console.log(`Chart data for ${name}:`, { 
    dataPoints: data.length, 
    currentPrice: displayPrice, 
    trend: isPositiveTrend ? 'positive' : 'negative',
    priceChange: priceChange.toFixed(2) + '%',
    chartType,
    sampleData: data.slice(0, 2),
    hasOHLC: chartType === 'candlestick' ? data.some(item => 
      typeof item.open === 'number' && 
      typeof item.high === 'number' && 
      typeof item.low === 'number' && 
      typeof item.close === 'number'
    ) : false
  });

  // Full-screen overlay component
  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
        {/* Full-screen header - compact for mobile */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-foreground truncate">{name}</h2>
              <p className="text-xs text-muted-foreground truncate">
                {selectedTimeframe.toUpperCase()} • {chartType === 'line' ? 'Line' : 'Candlestick'}
                {selectedContract && ` • ${selectedContract}`}
              </p>
            </div>
          </div>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsFullScreen(false)}
            className="shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Full-screen chart controls - compact */}
        <div className="px-4 py-2 border-b bg-background/95 shrink-0">
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

        {/* Full-screen chart - takes remaining space */}
        <div className="flex-1 p-4 overflow-hidden min-h-0">
          <div className="w-full h-full bg-card rounded-lg border shadow-sm p-4">
            <div style={{ width: '100%', height: 'calc(100vh - 200px)' }}>
              <ChartContainer
                data={data}
                name={name}
                selectedTimeframe={selectedTimeframe}
                chartType={chartType}
                loading={loading}
                error={error}
                isPositiveTrend={isPositiveTrend}
              />
            </div>
          </div>
        </div>

        {/* Full-screen footer - compact */}
        <div className="px-4 py-2 border-t bg-background shrink-0">
          <ChartFooter
            name={name}
            selectedTimeframe={selectedTimeframe}
            loading={loading}
            error={error}
            isPositiveTrend={isPositiveTrend}
            displayPrice={displayPrice}
            isPremium={isPremium}
            currentPrice={currentPrice}
          />
        </div>

        {/* Exit instruction */}
        <div className="px-4 py-1 text-center bg-background/80 shrink-0">
          <p className="text-xs text-muted-foreground">
            {isLandscape ? 'Rotate to portrait to exit' : 'Tap X to exit'}
          </p>
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

      <div className="h-[200px] sm:h-[250px] lg:h-[300px] w-full min-w-0 max-w-full overflow-hidden p-2 sm:p-4 bg-muted/20 rounded-md border border-border">
        <ChartContainer
          data={data}
          name={name}
          selectedTimeframe={selectedTimeframe}
          chartType={chartType}
          loading={loading}
          error={error}
          isPositiveTrend={isPositiveTrend}
        />
      </div>

      <ChartFooter
        name={name}
        selectedTimeframe={selectedTimeframe}
        loading={loading}
        error={error}
        isPositiveTrend={isPositiveTrend}
        displayPrice={displayPrice}
        isPremium={isPremium}
        currentPrice={currentPrice}
      />
    </Card>
  );
};

export default CommodityChart;