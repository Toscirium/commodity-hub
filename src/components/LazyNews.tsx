import React from 'react';
// Force rebuild to fix lazy import issue
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { Skeleton } from '@/components/ui/enhanced-skeleton';
import { Card } from '@/components/ui/card';
import { Newspaper } from 'lucide-react';

const CommodityNews = React.lazy(() => import('./CommodityNews'));

interface LazyNewsProps {
  commodity: string;
  className?: string;
}

// News skeleton component
const NewsSkeleton = () => (
  <Card className="box-border p-3 sm:p-6 mt-4 sm:mt-6 w-full min-w-0 max-w-[calc(100vw-1rem)] sm:max-w-full overflow-hidden bg-card border border-border">
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 rounded-lg bg-primary/10 text-primary">
        <Newspaper className="w-4 h-4" />
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" className="w-32 h-5" />
        <Skeleton variant="text" className="w-24 h-3" />
      </div>
    </div>
    
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-3 p-3 sm:p-4 rounded-lg border border-border/50 bg-background/50 min-w-0 overflow-hidden">
          <div className="flex items-start gap-3 min-w-0">
            <Skeleton variant="rectangular" className="w-16 h-16 rounded-lg" />
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton variant="text" className="w-full h-4" />
              <Skeleton variant="text" className="w-3/4 h-4" />
              <div className="flex gap-2">
                <Skeleton variant="text" className="w-16 h-3" />
                <Skeleton variant="text" className="w-12 h-3" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  </Card>
);

const LazyNews: React.FC<LazyNewsProps> = ({ commodity, className = '' }) => {
  const { elementRef, isIntersecting } = useIntersectionObserver({
    rootMargin: '300px', // Load news when they're 300px away from viewport
    threshold: 0.1,
    triggerOnce: true,
  });

  return (
    <div ref={elementRef as React.RefObject<HTMLDivElement>} className={`box-border w-full min-w-0 max-w-[calc(100vw-1rem)] sm:max-w-full overflow-hidden ${className}`}>
      {isIntersecting ? (
        <React.Suspense fallback={<NewsSkeleton />}>
          <CommodityNews commodity={commodity} />
        </React.Suspense>
      ) : (
        <NewsSkeleton />
      )}
    </div>
  );
};

export default React.memo(LazyNews);