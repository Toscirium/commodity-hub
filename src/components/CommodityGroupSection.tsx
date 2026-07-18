import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import CommodityCard from './CommodityCard';
import { Commodity } from '@/hooks/useCommodityData';
import { 
  Zap, 
  Coins, 
  Wheat, 
  Beef, 
  Coffee, 
  Package,
  TrendingUp,
  TrendingDown,
  Activity
} from 'lucide-react';

interface CommodityGroupSectionProps {
  title: string;
  category: string;
  commodities: Commodity[];
  isExpanded?: boolean;
  onToggle?: () => void;
}

// Helper functions for group icon and color
const getGroupIcon = (category: string) => {
  switch (category) {
    case 'metals':
      return <Coins className="w-5 h-5" />;
    case 'grains':
      return <Wheat className="w-5 h-5" />;
    case 'livestock':
      return <Beef className="w-5 h-5" />;
    case 'softs':
      return <Coffee className="w-5 h-5" />;
    case 'emissions':
      return <Zap className="w-5 h-5" />;
    case 'other':
      return <Package className="w-5 h-5" />;
    default:
      return <Zap className="w-5 h-5" />;
  }
};

const getGroupColor = (category: string) => {
  switch (category) {
    case 'energy':
      return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
    case 'metals':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'grains':
      return 'bg-green-500/10 text-green-600 dark:text-green-400';
    case 'livestock':
      return 'bg-red-500/10 text-red-600 dark:text-red-400';
    case 'softs':
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
    case 'emissions':
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
    case 'other':
      return 'bg-gray-500/10 text-gray-600 dark:text-gray-400';
    default:
      return 'bg-primary/10 text-primary';
  }
};

const CommodityGroupSection = React.memo(({ 
  title, 
  category, 
  commodities, 
  isExpanded = true,
  onToggle 
}: CommodityGroupSectionProps) => {
  // Memoize expensive calculations
  const { gainers, losers, unchanged, avgChange } = React.useMemo(() => {
    const gainers = commodities.filter(c => c.changePercent > 0);
    const losers = commodities.filter(c => c.changePercent < 0);
    const unchanged = commodities.filter(c => c.changePercent === 0);
    
    const avgChange = commodities.length > 0 
      ? commodities.reduce((sum, c) => sum + c.changePercent, 0) / commodities.length 
      : 0;
      
    return { gainers, losers, unchanged, avgChange };
  }, [commodities]);

  // Memoize group icon and color
  const groupIcon = React.useMemo(() => getGroupIcon(category), [category]);
  const groupColor = React.useMemo(() => getGroupColor(category), [category]);

  // Memoize click handler
  const handleToggle = React.useCallback(() => {
    onToggle?.();
  }, [onToggle]);

  if (commodities.length === 0) return null;

  return (
    <Card className="w-full min-w-0 max-w-full overflow-hidden bg-card border border-border">
      <div 
        className="p-4 sm:p-6 border-b border-border bg-muted/20 cursor-pointer hover:bg-muted/30 transition-colors duration-150 mobile-touch-target"
        onClick={handleToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`p-2 sm:p-3 rounded-md ${groupColor} transition-colors duration-150`}>
              {groupIcon}
            </div>
            <div>
              <h3 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">
                {commodities.length} commodities • Average: {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Group Statistics */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-950/20">
                  <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
                  <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                    {gainers.length}
                  </span>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-950/20">
                  <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400" />
                  <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                    {losers.length}
                  </span>
                </div>
                {unchanged.length > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-950/20">
                    <Activity className="w-3 h-3 text-gray-600 dark:text-gray-400" />
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-400">
                      {unchanged.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Group Performance Badge */}
            <Badge 
              variant={avgChange >= 0 ? "default" : "destructive"}
              className={`hidden sm:inline-flex font-bold ${
                avgChange >= 0 
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400 border-green-200 dark:border-green-800' 
                  : 'bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400 border-red-200 dark:border-red-800'
              }`}
            >
              {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
            </Badge>
          </div>
        </div>
        
        {/* Mobile Statistics */}
        <div className="sm:hidden mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-950/20">
              <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
              <span className="font-semibold text-green-700 dark:text-green-400">{gainers.length}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 dark:bg-red-950/20">
              <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400" />
              <span className="font-semibold text-red-700 dark:text-red-400">{losers.length}</span>
            </div>
          </div>
          <Badge 
            variant={avgChange >= 0 ? "default" : "destructive"}
            className={`font-bold ${
              avgChange >= 0 
                ? 'bg-green-100 text-green-700 dark:bg-green-950/20 dark:text-green-400' 
                : 'bg-red-100 text-red-700 dark:bg-red-950/20 dark:text-red-400'
            }`}
          >
            {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(2)}%
          </Badge>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 sm:p-6 w-full min-w-0 max-w-full overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:gap-4 w-full min-w-0 max-w-full overflow-hidden">
            {commodities.map((commodity, index) => (
              <div 
                key={commodity.symbol}
                className="animate-slide-up min-w-0 w-full"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <CommodityCard
                  name={commodity.name}
                  symbol={commodity.symbol}
                  price={commodity.price}
                  change={commodity.change || 0}
                  changePercent={commodity.changePercent}
                  venue={commodity.venue}
                  contractSize={commodity.contractSize}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
});

export default CommodityGroupSection;