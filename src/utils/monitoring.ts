import { toast } from '@/hooks/use-toast';

// Performance monitoring and error tracking utilities
export interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface ErrorInfo {
  message: string;
  stack?: string;
  component?: string;
  timestamp: number;
  userId?: string;
  metadata?: Record<string, any>;
}

class MonitoringService {
  private metrics: PerformanceMetric[] = [];
  private errors: ErrorInfo[] = [];
  private performanceObserver?: PerformanceObserver;

  constructor() {
    this.initializePerformanceObserver();
    this.setupGlobalErrorHandlers();
  }

  // Performance Monitoring
  private initializePerformanceObserver() {
    if ('PerformanceObserver' in window) {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.recordMetric({
            name: entry.name,
            value: entry.duration || entry.startTime,
            timestamp: Date.now(),
            metadata: {
              entryType: entry.entryType,
              startTime: entry.startTime,
            },
          });
        }
      });

      this.performanceObserver.observe({ 
        entryTypes: ['navigation', 'resource', 'measure', 'paint'] 
      });
    }
  }

  // Error Handling
  private setupGlobalErrorHandlers() {
    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      this.recordError({
        message: event.message,
        stack: event.error?.stack,
        component: 'Global',
        timestamp: Date.now(),
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.recordError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        component: 'Promise',
        timestamp: Date.now(),
        metadata: {
          reason: event.reason,
        },
      });
    });
  }

  // Record metrics
  recordMetric(metric: PerformanceMetric) {
    this.metrics.push(metric);
    
    // Keep only recent metrics (last 100)
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    // Log critical performance issues
    if (metric.value > 3000 && metric.name.includes('navigation')) {
      console.warn('Slow navigation detected:', metric);
    }
  }

  // Record errors
  recordError(error: ErrorInfo) {
    this.errors.push(error);
    
    // Keep only recent errors (last 50)
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }

    // Show user-friendly error message for critical errors
    if (error.message.includes('Network') || error.message.includes('fetch')) {
      toast({
        title: 'Connection Issue',
        description: 'Please check your internet connection and try again.',
        variant: 'destructive',
      });
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error recorded:', error);
    }
  }

  // Custom timing utilities
  startTimer(name: string): () => void {
    const startTime = performance.now();
    return () => {
      const endTime = performance.now();
      this.recordMetric({
        name,
        value: endTime - startTime,
        timestamp: Date.now(),
        metadata: { type: 'custom-timer' },
      });
    };
  }

  // API call monitoring
  async monitorApiCall<T>(
    name: string, 
    apiCall: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    try {
      const result = await apiCall();
      const endTime = performance.now();
      
      this.recordMetric({
        name: `api-${name}`,
        value: endTime - startTime,
        timestamp: Date.now(),
        metadata: { 
          type: 'api-call',
          status: 'success' 
        },
      });
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      
      this.recordMetric({
        name: `api-${name}`,
        value: endTime - startTime,
        timestamp: Date.now(),
        metadata: { 
          type: 'api-call',
          status: 'error' 
        },
      });

      this.recordError({
        message: `API Error in ${name}: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : undefined,
        component: 'API',
        timestamp: Date.now(),
        metadata: { apiName: name, error },
      });

      throw error;
    }
  }

  // Get monitoring data
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  getErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  // Generate performance report
  getPerformanceReport() {
    const recentMetrics = this.metrics.filter(
      m => Date.now() - m.timestamp < 300000 // Last 5 minutes
    );

    const apiCalls = recentMetrics.filter(m => m.name.startsWith('api-'));
    const navigationMetrics = recentMetrics.filter(m => m.name.includes('navigation'));

    return {
      totalMetrics: recentMetrics.length,
      averageApiResponseTime: apiCalls.length > 0 
        ? apiCalls.reduce((sum, m) => sum + m.value, 0) / apiCalls.length 
        : 0,
      navigationTime: navigationMetrics.length > 0 
        ? navigationMetrics[navigationMetrics.length - 1].value 
        : 0,
      errorCount: this.errors.filter(e => Date.now() - e.timestamp < 300000).length,
      slowApiCalls: apiCalls.filter(m => m.value > 2000).length,
    };
  }

  // Clear old data
  cleanup() {
    const cutoff = Date.now() - 1800000; // 30 minutes ago
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    this.errors = this.errors.filter(e => e.timestamp > cutoff);
  }
}

// Singleton instance
export const monitoring = new MonitoringService();

// React hook for performance monitoring
export const usePerformanceMonitoring = () => {
  const recordMetric = (metric: Omit<PerformanceMetric, 'timestamp'>) => {
    monitoring.recordMetric({ ...metric, timestamp: Date.now() });
  };

  const recordError = (error: Omit<ErrorInfo, 'timestamp'>) => {
    monitoring.recordError({ ...error, timestamp: Date.now() });
  };

  const startTimer = (name: string) => monitoring.startTimer(name);

  const monitorApiCall = <T>(name: string, apiCall: () => Promise<T>) => 
    monitoring.monitorApiCall(name, apiCall);

  return {
    recordMetric,
    recordError,
    startTimer,
    monitorApiCall,
    getMetrics: () => monitoring.getMetrics(),
    getErrors: () => monitoring.getErrors(),
    getReport: () => monitoring.getPerformanceReport(),
  };
};

// Cleanup interval
setInterval(() => {
  monitoring.cleanup();
}, 600000); // Every 10 minutes
