
import React from 'react';
import { ResponsiveContainer } from 'recharts';
import { CommodityHistoricalData } from '@/hooks/useCommodityData';
import { formatPrice } from '@/lib/commodityUtils';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, TrendingUp, TrendingDown } from 'lucide-react';

interface CandlestickData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CandlestickChartProps {
  data: CandlestickData[];
  formatXAxisTick: (date: string) => string;
  formatTooltipLabel: (label: string) => string;
  commodityName?: string;
}

const CandlestickChart = ({ data, formatXAxisTick, formatTooltipLabel, commodityName = '' }: CandlestickChartProps) => {
  const [hoveredIndex, setHoveredIndex] = React.useState<number | null>(null);
  const [tooltipData, setTooltipData] = React.useState<{
    x: number;
    y: number;
    data: CandlestickData;
  } | null>(null);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const [scrollOffset, setScrollOffset] = React.useState(0);
  const [showGridlines, setShowGridlines] = React.useState(true);
  const [showVolume, setShowVolume] = React.useState(false);

  console.log('CandlestickChart received data:', data.length, 'items:', data.slice(0, 2));

  // Calculate visible data based on zoom and scroll
  const getVisibleData = () => {
    const itemsToShow = Math.floor(data.length / zoomLevel);
    const start = Math.max(0, Math.min(scrollOffset, data.length - itemsToShow));
    const end = Math.min(start + itemsToShow, data.length);
    return data.slice(start, end);
  };

  const visibleData = getVisibleData();

  const handleMouseMove = (event: React.MouseEvent<SVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;
    const dataIndex = Math.floor((x / width) * visibleData.length);
    
    if (dataIndex >= 0 && dataIndex < visibleData.length) {
      setHoveredIndex(dataIndex);
      setTooltipData({
        x: event.clientX,
        y: event.clientY,
        data: visibleData[dataIndex]
      });
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
    setTooltipData(null);
  };

  const handleWheel = (event: React.WheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(5, prev * 1.2));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(0.5, prev / 1.2));
  const handleReset = () => {
    setZoomLevel(1);
    setScrollOffset(0);
  };

  const maxPrice = Math.max(...visibleData.map(d => d.high));
  const minPrice = Math.min(...visibleData.map(d => d.low));
  const priceRange = maxPrice - minPrice;
  const padding = priceRange * 0.1;

  // Calculate trend
  const firstPrice = visibleData[0]?.close || 0;
  const lastPrice = visibleData[visibleData.length - 1]?.close || 0;
  const trend = lastPrice - firstPrice;
  const trendPercent = firstPrice !== 0 ? ((trend / firstPrice) * 100) : 0;

  // Calculate price levels for gridlines
  const getPriceGridlines = () => {
    const steps = 5;
    const stepSize = (priceRange + 2 * padding) / steps;
    return Array.from({ length: steps + 1 }, (_, i) => 
      maxPrice + padding - (i * stepSize)
    );
  };

  const priceGridlines = getPriceGridlines();

  // If no data, show message
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 mx-auto bg-muted/50 rounded-full flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No OHLC data available for candlestick chart</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-card rounded-lg border border-border/50 overflow-hidden">
      {/* Chart Controls */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
        <div className="flex items-center gap-1 bg-background/80 backdrop-blur-sm rounded-lg p-1 border border-border/50">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleZoomIn}
            className="h-7 w-7 p-0 hover:bg-muted/80"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleZoomOut}
            className="h-7 w-7 p-0 hover:bg-muted/80"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleReset}
            className="h-7 w-7 p-0 hover:bg-muted/80"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Trend Indicator */}
      <div className="absolute top-2 right-2 z-10">
        <div className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium ${
          trend >= 0 
            ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
            : 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
        }`}>
          {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span>{trend >= 0 ? '+' : ''}{trendPercent.toFixed(2)}%</span>
        </div>
      </div>

      {/* Main Chart */}
      <svg
        width="100%"
        height="100%"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        className="cursor-crosshair"
        viewBox="0 0 800 400"
        preserveAspectRatio="none"
      >
        {/* Background gridlines */}
        {showGridlines && (
          <g className="opacity-20">
            {/* Horizontal price gridlines */}
            {priceGridlines.map((price, index) => {
              const y = ((maxPrice + padding - price) / (priceRange + 2 * padding)) * 340 + 20;
              return (
                <g key={`grid-${index}`}>
                  <line
                    x1={30}
                    y1={y}
                    x2={770}
                    y2={y}
                    stroke="currentColor"
                    strokeWidth={0.5}
                    strokeDasharray="2,2"
                  />
                  <text
                    x={25}
                    y={y + 3}
                    textAnchor="end"
                    className="text-2xs fill-muted-foreground"
                  >
                    {formatPrice(price, commodityName, 2, false)}
                  </text>
                </g>
              );
            })}
            
            {/* Vertical time gridlines */}
            {visibleData.filter((_, index) => index % Math.ceil(visibleData.length / 8) === 0).map((item, index) => {
              const actualIndex = index * Math.ceil(visibleData.length / 8);
              const x = (actualIndex / Math.max(visibleData.length - 1, 1)) * 740 + 30;
              
              return (
                <line
                  key={`vgrid-${actualIndex}`}
                  x1={x}
                  y1={20}
                  x2={x}
                  y2={360}
                  stroke="currentColor"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                />
              );
            })}
          </g>
        )}

        {/* Candlesticks */}
        {visibleData.map((item, index) => {
          const x = (index / Math.max(visibleData.length - 1, 1)) * 740 + 30;
          const isGreen = item.close > item.open;
          const bodyTop = Math.max(item.open, item.close);
          const bodyBottom = Math.min(item.open, item.close);
          
          const chartHeight = 340;
          const highY = ((maxPrice + padding - item.high) / (priceRange + 2 * padding)) * chartHeight + 20;
          const lowY = ((maxPrice + padding - item.low) / (priceRange + 2 * padding)) * chartHeight + 20;
          const bodyTopY = ((maxPrice + padding - bodyTop) / (priceRange + 2 * padding)) * chartHeight + 20;
          const bodyBottomY = ((maxPrice + padding - bodyBottom) / (priceRange + 2 * padding)) * chartHeight + 20;
          
          const isHovered = hoveredIndex === index;
          const candleWidth = Math.max(2, Math.min(16, (740 / visibleData.length) * 0.7));

          return (
            <g key={`candle-${index}`} className="transition-all duration-150">
              {/* Hover background */}
              {isHovered && (
                <rect
                  x={Math.max(30, x - candleWidth * 2)}
                  y={20}
                  width={candleWidth * 4}
                  height={340}
                  fill="rgba(59, 130, 246, 0.05)"
                  stroke="rgba(59, 130, 246, 0.2)"
                  strokeWidth={1}
                  rx={2}
                />
              )}
              
              {/* Wick (shadow) */}
              <line
                x1={x}
                y1={highY}
                x2={x}
                y2={lowY}
                stroke={isGreen ? '#059669' : '#dc2626'}
                strokeWidth={isHovered ? 2 : 1}
                className="transition-all duration-150"
              />
              
              {/* Body */}
              <rect
                x={x - candleWidth/2}
                y={Math.min(bodyTopY, bodyBottomY)}
                width={candleWidth}
                height={Math.max(Math.abs(bodyBottomY - bodyTopY), 1)}
                fill={isGreen ? '#10b981' : '#ef4444'}
                stroke={isGreen ? '#059669' : '#dc2626'}
                strokeWidth={isHovered ? 2 : 1}
                rx={1}
                className={`transition-all duration-150 ${isHovered ? 'drop-shadow-sm' : ''}`}
              />
              
              {/* Volume bar (if enabled and data available) */}
              {showVolume && item.volume && (
                <rect
                  x={x - candleWidth/2}
                  y={365}
                  width={candleWidth}
                  height={Math.min(15, (item.volume / Math.max(...visibleData.map(d => d.volume || 0))) * 15)}
                  fill={isGreen ? '#10b981' : '#ef4444'}
                  opacity={0.6}
                  rx={1}
                />
              )}
            </g>
          );
        })}
        
        {/* Enhanced X-axis labels */}
        {visibleData.filter((_, index) => index % Math.ceil(visibleData.length / 6) === 0).map((item, index) => {
          const actualIndex = index * Math.ceil(visibleData.length / 6);
          const x = (actualIndex / Math.max(visibleData.length - 1, 1)) * 740 + 30;
          
          return (
            <text
              key={actualIndex}
              x={x}
              y={385}
              textAnchor="middle"
              className="text-xs fill-muted-foreground font-medium"
            >
              {formatXAxisTick(item.date)}
            </text>
          );
        })}

        {/* Zoom level indicator */}
        <text
          x={770}
          y={385}
          textAnchor="end"
          className="text-2xs fill-muted-foreground/60"
        >
          {zoomLevel.toFixed(1)}x
        </text>
      </svg>
      
      {/* Enhanced Custom Tooltip */}
      {tooltipData && (
        <div
          className="fixed z-50 bg-background/95 backdrop-blur-sm border border-border/50 rounded-xl p-4 shadow-xl pointer-events-none max-w-xs"
          style={{
            left: Math.min(tooltipData.x + 15, window.innerWidth - 250),
            top: Math.max(tooltipData.y - 150, 50),
          }}
        >
          <div className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${tooltipData.data.close > tooltipData.data.open ? 'bg-green-500' : 'bg-red-500'}`}></div>
            {formatTooltipLabel(tooltipData.data.date)}
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Open:</span>
                <span className="font-medium tabular-nums">{formatPrice(tooltipData.data.open, commodityName)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Close:</span>
                <span className="font-medium tabular-nums">{formatPrice(tooltipData.data.close, commodityName)}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">High:</span>
                <span className="font-medium text-green-600 dark:text-green-400 tabular-nums">{formatPrice(tooltipData.data.high, commodityName)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Low:</span>
                <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">{formatPrice(tooltipData.data.low, commodityName)}</span>
              </div>
            </div>
          </div>

          {/* Change indicator */}
          <div className="mt-3 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Change:</span>
              <div className={`flex items-center gap-1 font-medium ${
                tooltipData.data.close >= tooltipData.data.open ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {tooltipData.data.close >= tooltipData.data.open ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span className="tabular-nums">
                  {((tooltipData.data.close - tooltipData.data.open) / tooltipData.data.open * 100).toFixed(2)}%
                </span>
              </div>
            </div>
            
            {tooltipData.data.volume && (
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-muted-foreground">Volume:</span>
                <span className="font-medium tabular-nums">{tooltipData.data.volume.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Instructions overlay */}
      <div className="absolute bottom-2 left-2 text-2xs text-muted-foreground/60 bg-background/60 backdrop-blur-sm rounded px-2 py-1">
        Scroll to zoom • Click and drag to pan
      </div>
    </div>
  );
};

export default CandlestickChart;
