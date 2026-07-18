
import { QueryClient, QueryClientConfig, defaultShouldDehydrateQuery } from '@tanstack/react-query';

interface QueryConfig {
  defaultStaleTime?: number;
  defaultGcTime?: number;
  defaultRefetchInterval?: number;
  enableOfflineSupport?: boolean;
  enableBackgroundRefetch?: boolean;
  enablePersistence?: boolean;
}

export const createOptimizedQueryClient = (config: QueryConfig = {}): QueryClient => {
  const {
    defaultStaleTime = 5 * 60 * 1000, // 5 minutes
    defaultGcTime = 10 * 60 * 1000,   // 10 minutes
    defaultRefetchInterval = false,
    enableOfflineSupport = true,
    enableBackgroundRefetch = true,
    enablePersistence = true,
  } = config;

  const queryClientConfig: QueryClientConfig = {
    defaultOptions: {
      queries: {
        // Stale time - how long data is considered fresh
        staleTime: defaultStaleTime,
        
        // Garbage collection time - how long inactive data stays in cache
        gcTime: defaultGcTime,
        
        // Background refetch settings
        refetchOnWindowFocus: enableBackgroundRefetch,
        refetchOnReconnect: enableBackgroundRefetch ? 'always' : false,
        refetchOnMount: enableBackgroundRefetch,
        refetchInterval: defaultRefetchInterval,
        refetchIntervalInBackground: false, // Don't refetch when tab is not visible
        
        // Retry configuration with exponential backoff
        retry: (failureCount, error) => {
          // Don't retry on client errors (4xx)
          if (error && typeof error === 'object' && 'status' in error) {
            const status = (error as any).status;
            if (status >= 400 && status < 500) {
              return false;
            }
          }
          
          // Don't retry on network errors if offline
          if (enableOfflineSupport && !navigator.onLine) {
            return false;
          }
          
          // Retry up to 3 times for server errors and network issues
          return failureCount < 3;
        },
        
        // Exponential backoff with jitter
        retryDelay: (attemptIndex) => {
          const baseDelay = Math.min(1000 * 2 ** attemptIndex, 30000);
          const jitter = Math.random() * 0.1 * baseDelay; // Add 10% jitter
          return baseDelay + jitter;
        },
        
        // Network mode for offline support
        networkMode: enableOfflineSupport ? 'offlineFirst' : 'online',
        
        // Structural sharing for performance
        structuralSharing: true,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
        
        // Network mode for offline support
        networkMode: enableOfflineSupport ? 'offlineFirst' : 'online',
        
        // Don't retry mutations when offline
        retryDelay: (attemptIndex) => {
          return Math.min(1000 * 2 ** attemptIndex, 30000);
        },
      },
      // Dehydration for SSR/persistence support
      dehydrate: {
        shouldDehydrateQuery: enablePersistence 
          ? (query) => defaultShouldDehydrateQuery(query) || query.state.status === 'success'
          : defaultShouldDehydrateQuery,
      },
    },
  };

  const queryClient = new QueryClient(queryClientConfig);

  // Add global error handler
  queryClient.setMutationDefaults(['commodity-action'], {
    onError: (error) => {
      console.error('Mutation error:', error);
      // You can add toast notifications here
    },
  });

  // Set up query cache event listeners for debugging and analytics
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'updated') {
      const query = event.query;
      if (query.state.status === 'error') {
        console.warn('Query failed:', query.queryKey, query.state.error);
      }
    }
  });

  // Clean up stale data periodically
  if (typeof window !== 'undefined') {
    const cleanupInterval = setInterval(() => {
      queryClient.getQueryCache().clear();
    }, 30 * 60 * 1000); // Clean every 30 minutes

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      clearInterval(cleanupInterval);
    });
  }

  return queryClient;
};

// Predefined configurations for different use cases
export const queryClientConfigs = {
  // High-frequency trading data
  realtime: {
    defaultStaleTime: 30 * 1000,     // 30 seconds
    defaultGcTime: 2 * 60 * 1000,    // 2 minutes
    enableBackgroundRefetch: true,
    enableOfflineSupport: true,
  },
  
  // Standard commodity data
  standard: {
    defaultStaleTime: 5 * 60 * 1000,  // 5 minutes
    defaultGcTime: 10 * 60 * 1000,    // 10 minutes
    enableBackgroundRefetch: true,
    enableOfflineSupport: true,
  },
  
  // Static/rarely changing data
  static: {
    defaultStaleTime: 30 * 60 * 1000, // 30 minutes
    defaultGcTime: 60 * 60 * 1000,    // 1 hour
    enableBackgroundRefetch: false,
    enableOfflineSupport: true,
  },
  
  // Mobile optimized (conservative data usage)
  mobile: {
    defaultStaleTime: 10 * 60 * 1000, // 10 minutes
    defaultGcTime: 15 * 60 * 1000,    // 15 minutes
    enableBackgroundRefetch: false,   // Reduce mobile data usage
    enableOfflineSupport: true,
  },
};

export default createOptimizedQueryClient;
