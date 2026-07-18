import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useOfflineStatus } from './useOfflineStatus';
import { useIsMobile } from './use-mobile';

interface QueryInvalidationOptions {
  refetchActive?: boolean;
  refetchInactive?: boolean;
  exact?: boolean;
}

export const useQueryInvalidation = () => {
  const queryClient = useQueryClient();
  const { isOnline } = useOfflineStatus();
  const isMobile = useIsMobile();

  // Invalidate commodity-related queries
  const invalidateCommodityQueries = React.useCallback(async (
    commodityName?: string,
    options: QueryInvalidationOptions = {}
  ) => {
    const { refetchActive = true, refetchInactive = false, exact = false } = options;
    
    const queryKeys = commodityName && exact 
      ? [['commodity-price', commodityName], ['commodity-historical', commodityName]]
      : [['commodity-price'], ['commodity-historical'], ['all-commodities']];

    for (const queryKey of queryKeys) {
      await queryClient.invalidateQueries({
        queryKey: queryKey,
        refetchType: refetchActive && isOnline ? 'active' : 'none',
      });
    }
  }, [queryClient, isOnline]);

  // Invalidate news queries
  const invalidateNewsQueries = React.useCallback(async (
    commodityName?: string,
    options: QueryInvalidationOptions = {}
  ) => {
    const { refetchActive = true } = options;
    
    await queryClient.invalidateQueries({
      queryKey: commodityName ? ['commodity-news', commodityName] : ['commodity-news'],
      refetchType: refetchActive && isOnline ? 'active' : 'none',
    });
  }, [queryClient, isOnline]);

  // Invalidate portfolio queries
  const invalidatePortfolioQueries = React.useCallback(async (
    options: QueryInvalidationOptions = {}
  ) => {
    const { refetchActive = true } = options;
    
    await queryClient.invalidateQueries({
      queryKey: ['portfolio'],
      refetchType: refetchActive && isOnline ? 'active' : 'none',
    });
  }, [queryClient, isOnline]);

  // Smart refresh - optimized for mobile/offline conditions
  const smartRefresh = React.useCallback(async () => {
    if (!isOnline) {
      console.log('Skipping refresh - offline');
      return;
    }

    // On mobile, be more conservative with refreshes
    const shouldRefreshInactive = !isMobile;
    
    // Priority 1: Essential commodity data
    await invalidateCommodityQueries(undefined, { 
      refetchActive: true, 
      refetchInactive: shouldRefreshInactive 
    });

    // Priority 2: Portfolio data (if user is logged in)
    const hasPortfolioData = queryClient.getQueryCache().find({ queryKey: ['portfolio'] });
    if (hasPortfolioData) {
      await invalidatePortfolioQueries({ refetchActive: true });
    }

    // Priority 3: News (lower priority, don't refetch inactive)
    await invalidateNewsQueries(undefined, { 
      refetchActive: true, 
      refetchInactive: false 
    });
  }, [queryClient, isOnline, isMobile, invalidateCommodityQueries, invalidatePortfolioQueries, invalidateNewsQueries]);

  // Prefetch important queries
  const prefetchCommodityData = React.useCallback(async (commodityName: string) => {
    if (!isOnline) return;

    // Prefetch price data
    await queryClient.prefetchQuery({
      queryKey: ['commodity-price', commodityName],
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

    // Prefetch historical data (lower priority)
    setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['commodity-historical', commodityName, '1d', 'line'],
        staleTime: 10 * 60 * 1000, // 10 minutes
      });
    }, 1000);
  }, [queryClient, isOnline]);

  // Clear cache selectively
  const clearCache = React.useCallback(async (type?: 'all' | 'commodity' | 'news' | 'portfolio') => {
    switch (type) {
      case 'commodity':
        queryClient.removeQueries({
          queryKey: ['commodity-price'],
        });
        queryClient.removeQueries({
          queryKey: ['commodity-historical'],
        });
        queryClient.removeQueries({
          queryKey: ['all-commodities'],
        });
        break;
      case 'news':
        queryClient.removeQueries({
          queryKey: ['commodity-news'],
        });
        break;
      case 'portfolio':
        queryClient.removeQueries({
          queryKey: ['portfolio'],
        });
        break;
      default:
        queryClient.clear();
        break;
    }
  }, [queryClient]);

  // Get cache statistics
  const getCacheStats = React.useCallback(() => {
    const cache = queryClient.getQueryCache();
    const queries = cache.getAll();
    
    const stats = {
      totalQueries: queries.length,
      freshQueries: queries.filter(query => query.isStale() === false).length,
      staleQueries: queries.filter(query => query.isStale()).length,
      errorQueries: queries.filter(query => query.state.status === 'error').length,
      loadingQueries: queries.filter(query => query.state.status === 'pending').length,
      cacheSize: new Blob([JSON.stringify(queries.map(q => q.state.data))]).size,
    };

    return stats;
  }, [queryClient]);

  return {
    // Invalidation methods
    invalidateCommodityQueries,
    invalidateNewsQueries,
    invalidatePortfolioQueries,
    smartRefresh,
    
    // Prefetch methods
    prefetchCommodityData,
    
    // Cache management
    clearCache,
    getCacheStats,
    
    // Status
    isOnline,
    isMobile,
  };
};

export default useQueryInvalidation;