import React from 'react';
import { useLocation } from 'react-router-dom';
import { monitoringService } from '@/services/monitoringService';

export function useAnalytics() {
  const location = useLocation();

  // Track page views
  React.useEffect(() => {
    monitoringService.trackUserEvent('page_view', {
      path: location.pathname,
      search: location.search,
      hash: location.hash,
      timestamp: Date.now()
    });
  }, [location]);

  // Track user interactions
  const trackClick = React.useCallback((element: string, context?: Record<string, any>) => {
    monitoringService.trackUserEvent('click', {
      element,
      path: location.pathname,
      ...context
    });
  }, [location.pathname]);

  const trackFormSubmit = React.useCallback((formName: string, success: boolean, context?: Record<string, any>) => {
    monitoringService.trackUserEvent('form_submit', {
      formName,
      success,
      path: location.pathname,
      ...context
    });
  }, [location.pathname]);

  const trackSearch = React.useCallback((query: string, results?: number, context?: Record<string, any>) => {
    monitoringService.trackUserEvent('search', {
      query,
      results,
      path: location.pathname,
      ...context
    });
  }, [location.pathname]);

  const trackFeatureUsage = React.useCallback((feature: string, context?: Record<string, any>) => {
    monitoringService.trackUserEvent('feature_usage', {
      feature,
      path: location.pathname,
      ...context
    });
  }, [location.pathname]);

  const trackError = React.useCallback((error: string | Error, context?: Record<string, any>) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'object' ? error.stack : undefined;
    
    monitoringService.reportError({
      message: errorMessage,
      stack,
      context: {
        path: location.pathname,
        ...context
      },
      severity: 'medium'
    });
  }, [location.pathname]);

  const trackTiming = React.useCallback((name: string, duration: number, context?: Record<string, any>) => {
    monitoringService.reportPerformance(name, duration, 'ms', {
      path: location.pathname,
      ...context
    });
  }, [location.pathname]);

  const trackCustomEvent = React.useCallback((event: string, properties?: Record<string, any>) => {
    monitoringService.trackUserEvent(event, {
      path: location.pathname,
      ...properties
    });
  }, [location.pathname]);

  return {
    trackClick,
    trackFormSubmit,
    trackSearch,
    trackFeatureUsage,
    trackError,
    trackTiming,
    trackCustomEvent
  };
}

// HOC placeholder - implementation simplified for compatibility
export const withAnalytics = (Component: any, componentName?: string) => Component;