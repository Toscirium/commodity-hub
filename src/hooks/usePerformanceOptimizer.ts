import React from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

interface PerformanceConfig {
  enableVirtualization?: boolean;
  enableImageLazyLoading?: boolean;
  enableChartLazyLoading?: boolean;
  debounceDelay?: number;
  throttleDelay?: number;
}

export const usePerformanceOptimizer = (config: PerformanceConfig = {}) => {
  const {
    enableVirtualization = true,
    enableImageLazyLoading = true,
    enableChartLazyLoading = true,
    debounceDelay = 300,
    throttleDelay = 16, // ~60fps
  } = config;

  const isMobile = useIsMobile();
  const debounceTimeoutRef = React.useRef<NodeJS.Timeout>();
  const throttleTimeoutRef = React.useRef<NodeJS.Timeout>();
  const lastExecRef = React.useRef<number>(0);

  // Debounce function
  const debounce = React.useCallback((func: (...args: any[]) => void, delay: number = debounceDelay) => {
    return (...args: any[]) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => func(...args), delay);
    };
  }, [debounceDelay]);

  // Throttle function
  const throttle = React.useCallback((func: (...args: any[]) => void, delay: number = throttleDelay) => {
    return (...args: any[]) => {
      const now = Date.now();
      if (now - lastExecRef.current > delay) {
        lastExecRef.current = now;
        func(...args);
      } else if (!throttleTimeoutRef.current) {
        throttleTimeoutRef.current = setTimeout(() => {
          lastExecRef.current = Date.now();
          func(...args);
          throttleTimeoutRef.current = undefined;
        }, delay - (now - lastExecRef.current));
      }
    };
  }, [throttleDelay]);

  // Optimize for mobile performance
  const mobileOptimizations = React.useMemo(() => ({
    // Reduce animation complexity on mobile
    reduceMotion: isMobile,
    // Use smaller image sizes on mobile
    imageQuality: isMobile ? 'medium' : 'high',
    // Enable more aggressive virtualization on mobile
    virtualizeThreshold: isMobile ? 5 : 10,
    // Use faster chart rendering on mobile
    chartPerformanceMode: isMobile ? 'fast' : 'quality',
  }), [isMobile]);

  // Performance monitoring
  const measurePerformance = React.useCallback((name: string, fn: () => void) => {
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark(`${name}-start`);
      fn();
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
    } else {
      fn();
    }
  }, []);

  // Batch DOM updates
  const batchUpdates = React.useCallback((updates: (() => void)[]) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        updates.forEach(update => update());
      });
    } else {
      updates.forEach(update => update());
    }
  }, []);

  // Memory management
  const cleanupRefs = React.useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    if (throttleTimeoutRef.current) {
      clearTimeout(throttleTimeoutRef.current);
    }
  }, []);

  // Cleanup on unmount
  React.useEffect(() => {
    return cleanupRefs;
  }, [cleanupRefs]);

  // Intersection observer options optimized for performance
  const intersectionOptions = React.useMemo(() => ({
    rootMargin: isMobile ? '50px' : '100px',
    threshold: isMobile ? 0.05 : 0.1,
  }), [isMobile]);

  // Image loading strategy
  const imageLoadingStrategy = React.useMemo(() => ({
    loading: enableImageLazyLoading ? 'lazy' as const : 'eager' as const,
    decoding: 'async' as const,
    fetchPriority: 'low' as const,
  }), [enableImageLazyLoading]);

  return {
    // Performance utilities
    debounce,
    throttle,
    measurePerformance,
    batchUpdates,
    
    // Configuration flags
    shouldVirtualize: enableVirtualization,
    shouldLazyLoadImages: enableImageLazyLoading,
    shouldLazyLoadCharts: enableChartLazyLoading,
    
    // Mobile optimizations
    mobileOptimizations,
    
    // Observer options
    intersectionOptions,
    
    // Image loading
    imageLoadingStrategy,
    
    // Cleanup
    cleanupRefs,
  };
};

export default usePerformanceOptimizer;