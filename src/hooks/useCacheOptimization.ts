import React, { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOfflineStatus } from './useOfflineStatus';
import { useIsMobile } from './use-mobile';

interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalQueries: number;
  cacheSize: number;
  staleQueries: number;
  errorQueries: number;
  memoryUsage: number;
}

interface PerformanceOptions {
  enableDetailedMetrics?: boolean;
  enableAutomaticCleanup?: boolean;
  enablePredictivePrefetch?: boolean;
  maxCacheSize?: number; // in MB
}

export const useCacheOptimization = (options: PerformanceOptions = {}) => {
  const {
    enableDetailedMetrics = false,
    enableAutomaticCleanup = true,
    enablePredictivePrefetch = true,
    maxCacheSize = 50, // 50MB default
  } = options;

  const queryClient = useQueryClient();
  const { isOnline } = useOfflineStatus();
  const isMobile = useIsMobile();

  // Cache metrics calculation
  const getCacheMetrics = useCallback((): CacheMetrics => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    // Calculate cache size
    const cacheData = queries.map(query => query.state.data);
    const cacheSize = new Blob([JSON.stringify(cacheData)]).size / (1024 * 1024); // MB
    
    // Calculate hit/miss rates from query observer data
    const totalQueries = queries.length;
    const staleQueries = queries.filter(query => query.isStale()).length;
    const errorQueries = queries.filter(query => query.state.status === 'error').length;
    
    // Estimate memory usage (if available)
    const memoryUsage = (performance as any).memory ? 
      ((performance as any).memory.usedJSHeapSize / (1024 * 1024)) : 0;

    return {
      hitRate: totalQueries > 0 ? ((totalQueries - staleQueries) / totalQueries) * 100 : 0,
      missRate: totalQueries > 0 ? (staleQueries / totalQueries) * 100 : 0,
      totalQueries,
      cacheSize,
      staleQueries,
      errorQueries,
      memoryUsage,
    };
  }, [queryClient]);

  // Automatic cache cleanup
  const performCacheCleanup = useCallback(async () => {
    const metrics = getCacheMetrics();
    
    // Clean up if cache is too large
    if (metrics.cacheSize > maxCacheSize) {
      console.log(`Cache size (${metrics.cacheSize.toFixed(2)}MB) exceeds limit (${maxCacheSize}MB), cleaning up...`);
      
      // Remove oldest stale queries first
      const cache = queryClient.getQueryCache();
      const queries = cache.getAll()
        .filter(query => query.isStale())
        .sort((a, b) => (a.state.dataUpdatedAt || 0) - (b.state.dataUpdatedAt || 0));
      
      // Remove oldest 25% of stale queries
      const queriesToRemove = queries.slice(0, Math.ceil(queries.length * 0.25));
      queriesToRemove.forEach(query => {
        queryClient.removeQueries({ queryKey: query.queryKey });
      });
    }

    // Clean up error queries older than 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    queryClient.getQueryCache().getAll()
      .filter(query => 
        query.state.status === 'error' && 
        (query.state.errorUpdatedAt || 0) < fiveMinutesAgo
      )
      .forEach(query => {
        queryClient.removeQueries({ queryKey: query.queryKey });
      });
  }, [queryClient, maxCacheSize, getCacheMetrics]);

  // Predictive prefetching based on user behavior
  const predictivePrefetch = useCallback(async (commodityName: string) => {
    if (!enablePredictivePrefetch || !isOnline) return;

    // Prefetch related timeframes when user views a commodity
    const timeframes = ['1h', '1d', '1w'];
    const chartTypes = ['line', 'candlestick'];
    
    // Stagger prefetch requests to avoid overwhelming the API
    timeframes.forEach((timeframe, index) => {
      setTimeout(() => {
        chartTypes.forEach(chartType => {
          queryClient.prefetchQuery({
            queryKey: ['commodity-historical', commodityName, timeframe, chartType],
            staleTime: 10 * 60 * 1000, // 10 minutes
          });
        });
      }, index * 500); // 500ms delay between requests
    });

    // Prefetch news for popular commodities
    setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['commodity-news', commodityName],
        staleTime: 15 * 60 * 1000, // 15 minutes
      });
    }, 1000);
  }, [queryClient, enablePredictivePrefetch, isOnline]);

  // Optimize query settings based on device and connection
  const getOptimizedQuerySettings = useCallback((queryType: 'price' | 'historical' | 'news') => {
    const baseSettings = {
      price: {
        staleTime: isMobile ? 2 * 60 * 1000 : 1 * 60 * 1000, // 2min mobile, 1min desktop
        gcTime: isMobile ? 5 * 60 * 1000 : 10 * 60 * 1000,   // 5min mobile, 10min desktop
        refetchInterval: (isOnline ? (isMobile ? 60000 : 30000) : false) as number | false, // 1min mobile, 30s desktop
      },
      historical: {
        staleTime: isMobile ? 10 * 60 * 1000 : 5 * 60 * 1000, // 10min mobile, 5min desktop
        gcTime: isMobile ? 15 * 60 * 1000 : 30 * 60 * 1000,   // 15min mobile, 30min desktop
        refetchInterval: false as const, // Historical data doesn't need frequent updates
      },
      news: {
        staleTime: 15 * 60 * 1000, // 15 minutes for all devices
        gcTime: 30 * 60 * 1000,    // 30 minutes for all devices
        refetchInterval: (isOnline ? 15 * 60 * 1000 : false) as number | false, // 15min when online
      },
    };

    return baseSettings[queryType];
  }, [isMobile, isOnline]);

  // Set up automatic cleanup interval
  useEffect(() => {
    if (!enableAutomaticCleanup) return;

    const cleanupInterval = setInterval(() => {
      performCacheCleanup();
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [enableAutomaticCleanup, performCacheCleanup]);

  // Cache metrics query (optional, for debugging)
  const { data: metrics } = useQuery({
    queryKey: ['cache-metrics'],
    queryFn: getCacheMetrics,
    enabled: enableDetailedMetrics,
    refetchInterval: 30000, // Update every 30 seconds
    staleTime: 25000,
  });

  // Manual cache optimization trigger
  const optimizeCache = useCallback(async () => {
    await performCacheCleanup();
    
    // Reset failed queries
    queryClient.resetQueries({
      predicate: (query) => query.state.status === 'error',
    });

    console.log('Cache optimization completed');
  }, [performCacheCleanup, queryClient]);

  return {
    // Cache metrics
    getCacheMetrics,
    metrics: enableDetailedMetrics ? metrics : null,
    
    // Optimization methods
    optimizeCache,
    performCacheCleanup,
    predictivePrefetch,
    
    // Settings
    getOptimizedQuerySettings,
    
    // Status
    isOnline,
    isMobile,
    cacheSize: getCacheMetrics().cacheSize,
  };
};

export default useCacheOptimization;