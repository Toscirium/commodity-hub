import React, { useEffect } from 'react';
import { useServiceWorker } from '@/hooks/useServiceWorker';
import { usePerformanceMonitoring } from '@/hooks/usePerformanceMonitoring';
import { crashReporter } from '@/utils/crashReporting';
import { networkMonitor, offlineStorage } from '@/utils/offlineOptimization';

/**
 * Play Store optimizations component that handles:
 * - Performance monitoring
 * - Security enhancements  
 * - PWA capabilities
 * - Offline support
 */
export const PlayStoreOptimizations: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { register, update, needsUpdate } = useServiceWorker();  
  const { trackEvent, reportError } = usePerformanceMonitoring();
  // const { getSecurityHeaders, extendSession } = useSecurity();

  useEffect(() => {
    // Initialize Play Store optimizations
    const initializeOptimizations = async () => {
      try {
        // Register service worker for offline support
        await register();
        
        // Track initial performance metrics
        trackEvent('app_initialization', {
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
          connectionType: (navigator as any).connection?.effectiveType || 'unknown'
        });

        // Extend user session if exists
        // extendSession();

        // Initialize offline functionality
        await offlineStorage.init();
        networkMonitor.init();

        // Add tracking breadcrumb
        crashReporter.trackUserAction('app_started');

        // Set up error reporting
        window.addEventListener('error', (event) => {
          reportError(event.error, {
            type: 'javascript_error',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
          });
        });

        window.addEventListener('unhandledrejection', (event) => {
          reportError(event.reason, {
            type: 'unhandled_promise_rejection'
          });
        });

        // Track app installation
        window.addEventListener('beforeinstallprompt', (e) => {
          e.preventDefault();
          trackEvent('pwa_install_prompt_shown', {
            timestamp: Date.now()
          });
        });

        // Track app launch source
        if ((navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches) {
          trackEvent('app_launched_standalone', {
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.error('Failed to initialize Play Store optimizations:', error);
        reportError(error as Error, { type: 'initialization_error' });
      }
    };

    initializeOptimizations();
  }, [register, trackEvent, reportError]);

  // Handle service worker updates
  useEffect(() => {
    if (needsUpdate) {
      // Show update notification
      const shouldUpdate = window.confirm(
        'A new version of the app is available. Would you like to update?'
      );
      
      if (shouldUpdate) {
        update();
      }
    }
  }, [needsUpdate, update]);

  return <>{children}</>;
};

// Performance budget monitoring
export const usePerformanceBudget = () => {
  useEffect(() => {
    // Monitor bundle size and performance
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Log slow operations for optimization
        if (entry.duration > 100) {
          console.warn(`Slow operation detected: ${entry.name} took ${entry.duration}ms`);
        }
      }
    });

    observer.observe({ entryTypes: ['measure', 'navigation'] });

    return () => observer.disconnect();
  }, []);
};

// App rating prompt
export const useAppRatingPrompt = () => {
  useEffect(() => {
    const showRatingPrompt = () => {
      const usageCount = parseInt(localStorage.getItem('app_usage_count') || '0');
      const hasRated = localStorage.getItem('has_rated') === 'true';
      const lastPrompt = parseInt(localStorage.getItem('last_rating_prompt') || '0');
      const now = Date.now();

      // Show rating prompt after 10 uses, if not rated, and not prompted in last 30 days
      if (usageCount >= 10 && !hasRated && (now - lastPrompt) > 30 * 24 * 60 * 60 * 1000) {
        const shouldRate = window.confirm(
          'Are you enjoying Commodity Hub? Please consider rating us on the Play Store!'
        );
        
        localStorage.setItem('last_rating_prompt', now.toString());
        
        if (shouldRate) {
          localStorage.setItem('has_rated', 'true');
          // Open Play Store rating page
          window.open('https://play.google.com/store/apps/details?id=app.lovable.c8fabd7a96c74aff8d7b001690ec23c7', '_blank');
        }
      }
    };

    // Increment usage count
    const currentCount = parseInt(localStorage.getItem('app_usage_count') || '0');
    localStorage.setItem('app_usage_count', (currentCount + 1).toString());

    // Check rating prompt after delay
    setTimeout(showRatingPrompt, 5000);
  }, []);
};