import { useToast } from '@/hooks/use-toast';

// Types for monitoring data
export interface ErrorReport {
  id: string;
  timestamp: number;
  message: string;
  stack?: string;
  url: string;
  userAgent: string;
  userId?: string;
  sessionId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: Record<string, any>;
}

export interface PerformanceMetric {
  id: string;
  timestamp: number;
  metric: string;
  value: number;
  unit: string;
  context?: Record<string, any>;
}

export interface UserEvent {
  id: string;
  timestamp: number;
  event: string;
  properties: Record<string, any>;
  userId?: string;
  sessionId: string;
}

export interface CrashReport {
  id: string;
  timestamp: number;
  error: Error;
  componentStack?: string;
  errorBoundary?: string;
  userId?: string;
  sessionId: string;
  appState?: Record<string, any>;
}

class MonitoringService {
  private sessionId: string;
  private userId?: string;
  private isEnabled: boolean = true;
  private errorQueue: ErrorReport[] = [];
  private performanceQueue: PerformanceMetric[] = [];
  private userEventQueue: UserEvent[] = [];
  private crashQueue: CrashReport[] = [];
  private flushInterval: number = 30000; // 30 seconds
  private maxQueueSize: number = 100;

  constructor() {
    this.sessionId = this.generateId();
    this.setupErrorHandlers();
    this.setupPerformanceMonitoring();
    this.startPeriodicFlush();
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupErrorHandlers() {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.reportError({
        message: event.message,
        stack: event.error?.stack,
        url: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        severity: 'high'
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        url: window.location.href,
        severity: 'high'
      });
    });
  }

  private setupPerformanceMonitoring() {
    // Monitor page load performance
    if (typeof window !== 'undefined' && 'performance' in window) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          
          if (navigation) {
            this.reportPerformance('page_load_time', navigation.loadEventEnd - navigation.fetchStart, 'ms');
            this.reportPerformance('dom_content_loaded', navigation.domContentLoadedEventEnd - navigation.fetchStart, 'ms');
            this.reportPerformance('first_paint', navigation.responseEnd - navigation.fetchStart, 'ms');
          }

          // Monitor memory usage if available
          if ('memory' in performance) {
            const memory = (performance as any).memory;
            this.reportPerformance('memory_used', memory.usedJSHeapSize, 'bytes');
            this.reportPerformance('memory_total', memory.totalJSHeapSize, 'bytes');
            this.reportPerformance('memory_limit', memory.jsHeapSizeLimit, 'bytes');
          }
        }, 1000);
      });
    }
  }

  private startPeriodicFlush() {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  // Error tracking
  reportError(error: {
    message: string;
    stack?: string;
    url?: string;
    lineno?: number;
    colno?: number;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
  }) {
    if (!this.isEnabled) return;

    const errorReport: ErrorReport = {
      id: this.generateId(),
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      url: error.url || window.location.href,
      userAgent: navigator.userAgent,
      userId: this.userId,
      sessionId: this.sessionId,
      severity: error.severity || 'medium',
      context: error.context
    };

    this.errorQueue.push(errorReport);
    this.trimQueue(this.errorQueue);

    // Immediately flush critical errors
    if (error.severity === 'critical') {
      this.flush();
    }
  }

  // Performance monitoring
  reportPerformance(metric: string, value: number, unit: string, context?: Record<string, any>) {
    if (!this.isEnabled) return;

    const performanceMetric: PerformanceMetric = {
      id: this.generateId(),
      timestamp: Date.now(),
      metric,
      value,
      unit,
      context
    };

    this.performanceQueue.push(performanceMetric);
    this.trimQueue(this.performanceQueue);
  }

  // User behavior analytics
  trackUserEvent(event: string, properties: Record<string, any> = {}) {
    if (!this.isEnabled) return;

    const userEvent: UserEvent = {
      id: this.generateId(),
      timestamp: Date.now(),
      event,
      properties,
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.userEventQueue.push(userEvent);
    this.trimQueue(this.userEventQueue);
  }

  // Crash reporting
  reportCrash(error: Error, componentStack?: string, errorBoundary?: string, appState?: Record<string, any>) {
    if (!this.isEnabled) return;

    const crashReport: CrashReport = {
      id: this.generateId(),
      timestamp: Date.now(),
      error,
      componentStack,
      errorBoundary,
      userId: this.userId,
      sessionId: this.sessionId,
      appState
    };

    this.crashQueue.push(crashReport);
    this.trimQueue(this.crashQueue);

    // Immediately flush crash reports
    this.flush();
  }

  // Performance monitoring utilities
  measureFunction<T extends (...args: any[]) => any>(fn: T, name: string): T {
    return ((...args: any[]) => {
      const start = performance.now();
      const result = fn(...args);
      const end = performance.now();
      
      this.reportPerformance(`function_${name}`, end - start, 'ms');
      
      return result;
    }) as T;
  }

  measureAsyncFunction<T extends (...args: any[]) => Promise<any>>(fn: T, name: string): T {
    return (async (...args: any[]) => {
      const start = performance.now();
      const result = await fn(...args);
      const end = performance.now();
      
      this.reportPerformance(`async_function_${name}`, end - start, 'ms');
      
      return result;
    }) as T;
  }

  // Component performance tracking
  trackComponentRender(componentName: string, renderTime: number) {
    this.reportPerformance(`component_render_${componentName}`, renderTime, 'ms');
  }

  // Network request tracking
  trackNetworkRequest(url: string, method: string, duration: number, status: number) {
    this.reportPerformance(`network_${method.toLowerCase()}`, duration, 'ms', {
      url,
      status
    });

    this.trackUserEvent('network_request', {
      url,
      method,
      duration,
      status
    });
  }

  private trimQueue<T>(queue: T[]) {
    if (queue.length > this.maxQueueSize) {
      queue.splice(0, queue.length - this.maxQueueSize);
    }
  }

  private async flush() {
    if (!this.isEnabled) return;

    const allData = {
      errors: [...this.errorQueue],
      performance: [...this.performanceQueue],
      userEvents: [...this.userEventQueue],
      crashes: [...this.crashQueue],
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: Date.now()
    };

    // Clear queues
    this.errorQueue = [];
    this.performanceQueue = [];
    this.userEventQueue = [];
    this.crashQueue = [];

    // Only send if there's data
    if (allData.errors.length > 0 || allData.performance.length > 0 || 
        allData.userEvents.length > 0 || allData.crashes.length > 0) {
      
      try {
        // In a real app, you'd send this to your analytics service
        console.log('📊 Monitoring Data:', allData);
        
        // You could send to services like:
        // - Sentry for error tracking
        // - Google Analytics for user events
        // - Custom analytics endpoint
        // await this.sendToAnalyticsService(allData);
        
      } catch (error) {
        console.error('Failed to send monitoring data:', error);
        // Put data back in queues if sending fails
        this.errorQueue.push(...allData.errors);
        this.performanceQueue.push(...allData.performance);
        this.userEventQueue.push(...allData.userEvents);
        this.crashQueue.push(...allData.crashes);
      }
    }
  }

  // Get current session data for debugging
  getSessionData() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      errorCount: this.errorQueue.length,
      performanceMetrics: this.performanceQueue.length,
      userEvents: this.userEventQueue.length,
      crashes: this.crashQueue.length
    };
  }

  // Force flush for debugging
  forceFlush() {
    return this.flush();
  }
}

// Singleton instance
export const monitoringService = new MonitoringService();

// React hook for easy usage
export function useMonitoring() {
  const { toast } = useToast();

  const reportError = (error: Error | string, context?: Record<string, any>) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'object' ? error.stack : undefined;
    
    monitoringService.reportError({
      message: errorMessage,
      stack,
      context,
      severity: 'medium'
    });

    toast({
      title: "Error Reported",
      description: "The error has been logged for investigation.",
      variant: "destructive"
    });
  };

  const trackEvent = (event: string, properties?: Record<string, any>) => {
    monitoringService.trackUserEvent(event, properties);
  };

  const measurePerformance = <T extends (...args: any[]) => any>(fn: T, name: string) => {
    return monitoringService.measureFunction(fn, name);
  };

  const measureAsyncPerformance = <T extends (...args: any[]) => Promise<any>>(fn: T, name: string) => {
    return monitoringService.measureAsyncFunction(fn, name);
  };

  return {
    reportError,
    trackEvent,
    measurePerformance,
    measureAsyncPerformance,
    getSessionData: () => monitoringService.getSessionData(),
    forceFlush: () => monitoringService.forceFlush()
  };
}

export default monitoringService;