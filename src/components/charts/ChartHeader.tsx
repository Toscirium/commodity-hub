import React from 'react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { TrendingUp, Calendar, ChartCandlestick } from 'lucide-react';
import { TIMEFRAMES } from './chartUtils';
import CurrencySelector from '@/components/CurrencySelector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ChartHeaderProps {
  name: string;
  selectedTimeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  chartType: 'line' | 'candlestick';
  onChartTypeChange: (type: 'line' | 'candlestick') => void;
  dataPoints: number;
  loading: boolean;
  isPositiveTrend: boolean;
  priceChange: number;
  ohlcAvailable?: boolean;
}

const ChartHeader: React.FC<ChartHeaderProps> = ({
  name,
  selectedTimeframe,
  onTimeframeChange,
  chartType,
  onChartTypeChange,
  dataPoints,
  loading,
  isPositiveTrend,
  priceChange,
  ohlcAvailable = false,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 w-full min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center gap-3 min-w-0 max-w-full">
        <div className={`p-2 rounded-xl transition-all duration-300 ${
          isPositiveTrend 
            ? 'bg-green-100 dark:bg-green-950/20 text-green-600 dark:text-green-400' 
            : 'bg-red-100 dark:bg-red-950/20 text-red-600 dark:text-red-400'
        }`}>
          <TrendingUp className="w-5 h-5" />
        </div>
        <div className="min-w-0 max-w-full overflow-hidden">
          <h4 className="text-sm sm:text-base font-bold text-foreground truncate">{name} Price History</h4>
          <p className="text-xs sm:text-sm text-muted-foreground font-medium truncate">
            {selectedTimeframe.toUpperCase()} • {chartType === 'candlestick' ? 'Candlestick' : 'Line'} • {loading ? 'Loading...' : `${dataPoints} data points`}
            {dataPoints > 0 && (
              <span className={`ml-2 font-semibold ${
                isPositiveTrend ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {priceChange > 0 ? '+' : ''}{priceChange.toFixed(2)}%
              </span>
            )}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0 max-w-full overflow-hidden">
        {/* Currency Selector */}
        <CurrencySelector compact />

        {/* Chart Type Toggle — disabled when provider returns close-only data */}
        <div className="flex items-center gap-2">
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Toggle
                    pressed={chartType === 'candlestick' && ohlcAvailable}
                    onPressedChange={(pressed) => onChartTypeChange(pressed ? 'candlestick' : 'line')}
                    disabled={!ohlcAvailable}
                    aria-label="Toggle candlestick chart"
                    className="data-[state=on]:bg-primary/20 data-[state=on]:text-primary disabled:opacity-40"
                    size="sm"
                  >
                    <ChartCandlestick className="w-4 h-4" />
                  </Toggle>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {ohlcAvailable
                  ? 'Toggle candlestick view'
                  : 'Candlesticks unavailable — provider returns close-only data for this commodity/timeframe.'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Calendar className="w-4 h-4 text-muted-foreground" />
        <div className="flex flex-wrap gap-1 sm:gap-2 p-1 bg-muted/50 rounded-lg min-w-0 max-w-full overflow-hidden">
          {TIMEFRAMES.map((tf) => (
            <Button
              key={tf.value}
              variant={selectedTimeframe === tf.value ? 'default' : 'ghost'}
              size="sm"
              onClick={() => onTimeframeChange(tf.value)}
              disabled={loading}
              className={`text-xs sm:text-sm font-semibold transition-all duration-200 ${
                selectedTimeframe === tf.value
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'hover:bg-muted/80 text-muted-foreground hover:text-foreground'
              }`}
            >
              {tf.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChartHeader;
