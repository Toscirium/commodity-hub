/**
 * Crash reporting and error tracking utilities
 */

interface ErrorContext {
  userId?: string;
  route?: string;
  userAgent?: string;
  timestamp?: number;
  buildVersion?: string;
  additional?: Record<string, any>;
}

interface CrashReport {
  error: Error;
  context: ErrorContext;
  stackTrace?: string;
  breadcrumbs?: Array<{
    timestamp: number;
    message: string;
    category: string;
    level: 'info' | 'warning' | 'error';
  }>;
}

class CrashReporter {
  private breadcrumbs: Array<{
    timestamp: number;
    message: string;
    category: string;
    level: 'info' | 'warning' | 'error';
  }> = [];

  private maxBreadcrumbs = 50;

  constructor() {
    this.setupGlobalErrorHandlers();
  }

  private setupGlobalErrorHandlers() {
    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      this.reportError(event.error, {
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        additional: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno
        }
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.reportError(new Error(event.reason), {
        route: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        additional: {
          type: 'unhandled_promise_rejection'
        }
      });
    });

    // Handle React errors (will be caught by Error Boundaries)
    this.addBreadcrumb('Crash reporter initialized', 'system', 'info');
  }

  addBreadcrumb(message: string, category: string, level: 'info' | 'warning' | 'error' = 'info') {
    this.breadcrumbs.push({
      timestamp: Date.now(),
      message,
      category,
      level
    });

    // Keep only the latest breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  reportError(error: Error, context: ErrorContext = {}) {
    const crashReport: CrashReport = {
      error,
      context: {
        ...context,
        buildVersion: '1.0.0',
        timestamp: context.timestamp || Date.now()
      },
      stackTrace: error.stack,
      breadcrumbs: [...this.breadcrumbs]
    };

    // Add breadcrumb for this error
    this.addBreadcrumb(
      `Error: ${error.message}`,
      'error',
      'error'
    );

    // Send to crash reporting service (implement your preferred service)
    this.sendCrashReport(crashReport);

    // Log locally for development
    if (process.env.NODE_ENV === 'development') {
      console.group('🚨 Crash Report');
      console.error('Error:', error);
      console.log('Context:', context);
      console.log('Breadcrumbs:', this.breadcrumbs.slice(-10));
      console.groupEnd();
    }
  }

  private async sendCrashReport(report: CrashReport) {
    try {
      // Store crash reports locally if offline
      const crashReports = JSON.parse(localStorage.getItem('crash_reports') || '[]');
      crashReports.push(report);
      
      // Keep only the latest 10 crash reports
      const recentReports = crashReports.slice(-10);
      localStorage.setItem('crash_reports', JSON.stringify(recentReports));

      // TODO: Send to your preferred crash reporting service
      // Examples: Sentry, LogRocket, Bugsnag, Firebase Crashlytics
      // await this.sendToSentry(report);
      // await this.sendToFirebase(report);
      
      console.log('Crash report stored locally');
    } catch (error) {
      console.error('Failed to store crash report:', error);
    }
  }

  // Method to retrieve crash reports for debugging
  getCrashReports(): CrashReport[] {
    try {
      return JSON.parse(localStorage.getItem('crash_reports') || '[]');
    } catch {
      return [];
    }
  }

  // Clear stored crash reports
  clearCrashReports() {
    localStorage.removeItem('crash_reports');
    this.breadcrumbs = [];
  }

  // Track user interactions for better debugging context
  trackUserAction(action: string, details?: Record<string, any>) {
    this.addBreadcrumb(
      `User action: ${action}`,
      'user_interaction',
      'info'
    );

    if (details) {
      this.addBreadcrumb(
        `Action details: ${JSON.stringify(details)}`,
        'user_interaction',
        'info'
      );
    }
  }

  // Track API calls
  trackApiCall(endpoint: string, method: string, status?: number) {
    const level = status && status >= 400 ? 'error' : 'info';
    this.addBreadcrumb(
      `API ${method} ${endpoint} ${status ? `(${status})` : ''}`,
      'api',
      level
    );
  }

  // Track navigation
  trackNavigation(from: string, to: string) {
    this.addBreadcrumb(
      `Navigation: ${from} -> ${to}`,
      'navigation',
      'info'
    );
  }
}

// Create a singleton instance
export const crashReporter = new CrashReporter();

// React Error Boundary helper
export const reportReactError = (error: Error, errorInfo: any) => {
  crashReporter.reportError(error, {
    route: window.location.pathname,
    userAgent: navigator.userAgent,
    additional: {
      type: 'react_error_boundary',
      componentStack: errorInfo.componentStack
    }
  });
};

// Performance monitoring helpers
export const trackPerformanceIssue = (metric: string, value: number, threshold: number) => {
  if (value > threshold) {
    crashReporter.addBreadcrumb(
      `Performance issue: ${metric} (${value}ms > ${threshold}ms)`,
      'performance',
      'warning'
    );
  }
};

export const trackMemoryUsage = () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    const usedPercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
    
    if (usedPercent > 80) {
      crashReporter.addBreadcrumb(
        `High memory usage: ${usedPercent.toFixed(1)}%`,
        'performance',
        'warning'
      );
    }
  }
};
