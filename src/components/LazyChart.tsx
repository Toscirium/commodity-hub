import React from 'react';
// Force rebuild to fix lazy import issue
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { Skeleton } from '@/components/ui/enhanced-skeleton';
import { Card } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

const CommodityChart = React.lazy(() => import('./CommodityChart'));

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

interface LazyChartProps {
  name: string;
  basePrice: number;
  selectedContract?: string;
  contractData?: FuturesContract | null;
  className?: string;
}

// Chart skeleton component
const ChartSkeleton = () => (
  <Card className="box-border p-3 sm:p-6 mt-4 sm:mt-6 w-full min-w-0 max-w-full overflow-hidden bg-card border border-border">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <BarChart3 className="w-4 h-4" />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" className="w-32 h-5" />
          <Skeleton variant="text" className="w-24 h-3" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton variant="rectangular" className="w-16 h-8" />
        <Skeleton variant="rectangular" className="w-16 h-8" />
        <Skeleton variant="rectangular" className="w-20 h-8" />
      </div>
    </div>
    
    <div className="h-[200px] sm:h-[250px] lg:h-[300px] w-full min-w-0 max-w-full overflow-hidden p-2 sm:p-4 bg-muted/20 rounded-md border border-border">
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto bg-muted/50 rounded-full flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-muted-foreground animate-pulse" />
          </div>
          <Skeleton variant="text" className="w-24 h-4 mx-auto" />
        </div>
      </div>
    </div>
    
    <div className="mt-4 flex justify-between items-center">
      <Skeleton variant="text" className="w-20 h-4" />
      <Skeleton variant="text" className="w-16 h-4" />
    </div>
  </Card>
);

const LazyChart: React.FC<LazyChartProps> = ({ 
  name, 
  basePrice, 
  selectedContract, 
  contractData,
  className = ''
}) => {
  const { elementRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '200px', // Load charts when they're 200px away from viewport
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <div ref={elementRef as React.RefObject<HTMLDivElement>} className={`w-full min-w-0 max-w-full overflow-hidden ${className}`}>
      {isIntersecting ? (
        <React.Suspense fallback={<ChartSkeleton />}>
          <CommodityChart
            name={name}
            basePrice={basePrice}
            selectedContract={selectedContract}
            contractData={contractData}
          />
        </React.Suspense>
      ) : (
        <ChartSkeleton />
      )}
    </div>
  );
};

export default React.memo(LazyChart);