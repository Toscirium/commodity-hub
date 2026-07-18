import React from 'react';
import { AlertTriangle, RefreshCw, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface DataErrorFallbackProps {
  error?: string | null;
  onRetry?: () => void;
  title?: string;
  description?: string;
  showRetry?: boolean;
  variant?: 'card' | 'inline' | 'full';
  children?: React.ReactNode;
}

export const DataErrorFallback: React.FC<DataErrorFallbackProps> = ({
  error,
  onRetry,
  title = "Unable to load data",
  description = "We're having trouble loading this information. Please try again.",
  showRetry = true,
  variant = 'card',
  children,
}) => {
  const content = (
    <div className="text-center space-y-4">
      <div className={`mx-auto rounded-full flex items-center justify-center ${
        variant === 'full' ? 'w-16 h-16 bg-destructive/10' : 'w-12 h-12 bg-destructive/10'
      }`}>
        <AlertTriangle className={`text-destructive ${
          variant === 'full' ? 'w-8 h-8' : 'w-6 h-6'
        }`} />
      </div>
      
      <div className="space-y-2">
        <h3 className={`font-semibold ${
          variant === 'full' ? 'text-lg' : 'text-base'
        }`}>
          {title}
        </h3>
        <p className={`text-muted-foreground ${
          variant === 'full' ? 'text-sm' : 'text-xs'
        }`}>
          {description}
        </p>
        
        {error && (
          <details className="text-left">
            <summary className="text-xs text-muted-foreground cursor-pointer">
              Error details
            </summary>
            <p className="text-xs font-mono text-destructive mt-1 p-2 bg-destructive/5 rounded">
              {error}
            </p>
          </details>
        )}
      </div>

      {showRetry && onRetry && (
        <Button 
          onClick={onRetry} 
          variant="outline" 
          size={variant === 'full' ? 'default' : 'sm'}
          className="gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Try Again
        </Button>
      )}

      {children}
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
        {content}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div className="min-h-[400px] flex items-center justify-center p-8">
        <Card className="max-w-md w-full">
          <CardContent className="p-6">
            {content}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default card variant
  return (
    <Card className="p-4">
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  );
};

// Specialized fallbacks for specific data types
export const CommodityDataFallback: React.FC<Omit<DataErrorFallbackProps, 'title' | 'description'>> = (props) => (
  <DataErrorFallback
    {...props}
    title="Commodity data unavailable"
    description="We couldn't load the latest commodity prices. Market data will be available when connection is restored."
  >
    <div className="flex items-center justify-center gap-2 mt-4 text-muted-foreground">
      <TrendingUp className="w-4 h-4" />
      <span className="text-xs">Live data will resume automatically</span>
    </div>
  </DataErrorFallback>
);

export const ChartDataFallback: React.FC<Omit<DataErrorFallbackProps, 'title' | 'description'>> = (props) => (
  <DataErrorFallback
    {...props}
    title="Chart data unavailable"
    description="Unable to load chart data at this time."
    variant="inline"
  />
);