import React from 'react';
import { useToast } from '@/hooks/use-toast';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isOnline: boolean;
  needsUpdate: boolean;
  isUpdating: boolean;
}

interface ServiceWorkerActions {
  register: () => Promise<void>;
  update: () => Promise<void>;
  unregister: () => Promise<void>;
  skipWaiting: () => void;
  clearCache: () => Promise<void>;
}

export const useServiceWorker = (): ServiceWorkerState & ServiceWorkerActions => {
  const { toast } = useToast();
  const [state, setState] = React.useState<ServiceWorkerState>({
    isSupported: 'serviceWorker' in navigator,
    isRegistered: false,
    isOnline: navigator.onLine,
    needsUpdate: false,
    isUpdating: false,
  });

  const [registration, setRegistration] = React.useState<ServiceWorkerRegistration | null>(null);

  // Register service worker
  const register = React.useCallback(async () => {
    if (!state.isSupported) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none', // Always check for updates
      });

      setRegistration(reg);
      setState(prev => ({ ...prev, isRegistered: true }));

      // Check for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setState(prev => ({ ...prev, needsUpdate: true }));
            toast({
              title: 'App Update Available',
              description: 'A new version is available. Refresh to update.',
            });
          }
        });
      });

      console.log('Service Worker registered successfully');
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      toast({
        title: 'Update Service Unavailable',
        description: 'App updates may not work properly.',
        variant: 'destructive',
      });
    }
  }, [state.isSupported, toast]);

  // Update service worker
  const update = React.useCallback(async () => {
    if (!registration) return;

    setState(prev => ({ ...prev, isUpdating: true }));

    try {
      await registration.update();
      
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // Reload page after update
      window.location.reload();
    } catch (error) {
      console.error('Service Worker update failed:', error);
      setState(prev => ({ ...prev, isUpdating: false }));
      toast({
        title: 'Update Failed',
        description: 'Failed to update the app. Please try again.',
        variant: 'destructive',
      });
    }
  }, [registration, toast]);

  // Skip waiting and activate new service worker
  const skipWaiting = React.useCallback(() => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [registration]);

  // Unregister service worker
  const unregister = React.useCallback(async () => {
    if (registration) {
      await registration.unregister();
      setRegistration(null);
      setState(prev => ({ ...prev, isRegistered: false, needsUpdate: false }));
    }
  }, [registration]);

  // Clear cache
  const clearCache = React.useCallback(async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
      
      toast({
        title: 'Cache Cleared',
        description: 'App cache has been cleared.',
      });
    }
  }, [toast]);

  // Listen to online/offline events
  React.useEffect(() => {
    const handleOnline = () => {
      setState(prev => ({ ...prev, isOnline: true }));
      toast({
        title: 'Back Online',
        description: 'Internet connection restored.',
      });
    };

    const handleOffline = () => {
      setState(prev => ({ ...prev, isOnline: false }));
      toast({
        title: 'Offline Mode',
        description: 'Using cached data. Some features may be limited.',
        variant: 'destructive',
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast]);

  // Listen to service worker messages
  React.useEffect(() => {
    if (!state.isSupported) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'SW_UPDATE_AVAILABLE') {
        setState(prev => ({ ...prev, needsUpdate: true }));
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, [state.isSupported]);

  // Auto-register on mount
  React.useEffect(() => {
    if (state.isSupported && !state.isRegistered) {
      register();
    }
  }, [state.isSupported, state.isRegistered, register]);

  return {
    ...state,
    register,
    update,
    unregister,
    skipWaiting,
    clearCache,
  };
};

// Cache management utilities
export const cacheManager = {
  // Preload critical resources
  preloadCritical: async () => {
    if ('caches' in window) {
      const cache = await caches.open('critical-v1');
      const criticalResources = [
        '/',
        '/dashboard',
        '/portfolio',
        // Add critical API endpoints
      ];
      
      await cache.addAll(criticalResources);
    }
  },

  // Clear specific cache
  clearSpecificCache: async (cacheName: string) => {
    if ('caches' in window) {
      await caches.delete(cacheName);
    }
  },

  // Get cache size
  getCacheSize: async (): Promise<number> => {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      return 0;
    }

    const estimate = await navigator.storage.estimate();
    return estimate.usage || 0;
  },

  // Check if resource is cached
  isCached: async (url: string): Promise<boolean> => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const response = await cache.match(url);
        if (response) return true;
      }
    }
    return false;
  },
};