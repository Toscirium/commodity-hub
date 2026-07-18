// Enhanced logging utility for better error tracking and debugging

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: string;
  metadata?: Record<string, any>;
  error?: Error;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private currentLevel: LogLevel;

  constructor() {
    this.currentLevel = process.env.NODE_ENV === 'development' 
      ? LogLevel.DEBUG 
      : LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.currentLevel;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: string,
    metadata?: Record<string, any>,
    error?: Error
  ): LogEntry {
    return {
      level,
      message,
      timestamp: Date.now(),
      context,
      metadata,
      error,
    };
  }

  private addLog(entry: LogEntry) {
    this.logs.push(entry);
    
    // Keep only recent logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Console output in development
    if (process.env.NODE_ENV === 'development') {
      this.consoleOutput(entry);
    }
  }

  private consoleOutput(entry: LogEntry) {
    const timestamp = new Date(entry.timestamp).toISOString();
    const context = entry.context ? `[${entry.context}]` : '';
    const message = `${timestamp} ${context} ${entry.message}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(message, entry.metadata);
        break;
      case LogLevel.INFO:
        console.info(message, entry.metadata);
        break;
      case LogLevel.WARN:
        console.warn(message, entry.metadata);
        break;
      case LogLevel.ERROR:
        console.error(message, entry.metadata, entry.error);
        break;
    }
  }

  debug(message: string, context?: string, metadata?: Record<string, any>) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      this.addLog(this.createLogEntry(LogLevel.DEBUG, message, context, metadata));
    }
  }

  info(message: string, context?: string, metadata?: Record<string, any>) {
    if (this.shouldLog(LogLevel.INFO)) {
      this.addLog(this.createLogEntry(LogLevel.INFO, message, context, metadata));
    }
  }

  warn(message: string, context?: string, metadata?: Record<string, any>) {
    if (this.shouldLog(LogLevel.WARN)) {
      this.addLog(this.createLogEntry(LogLevel.WARN, message, context, metadata));
    }
  }

  error(message: string, error?: Error, context?: string, metadata?: Record<string, any>) {
    if (this.shouldLog(LogLevel.ERROR)) {
      this.addLog(this.createLogEntry(LogLevel.ERROR, message, context, metadata, error));
    }
  }

  // Specialized logging methods
  apiCall(method: string, url: string, status?: number, duration?: number) {
    this.info(`API ${method} ${url}`, 'API', {
      method,
      url,
      status,
      duration,
    });
  }

  apiError(method: string, url: string, error: Error, status?: number) {
    this.error(`API ${method} ${url} failed`, error, 'API', {
      method,
      url,
      status,
    });
  }

  componentError(component: string, error: Error, props?: Record<string, any>) {
    this.error(`Error in ${component}`, error, 'Component', {
      component,
      props,
    });
  }

  userAction(action: string, metadata?: Record<string, any>) {
    this.info(`User action: ${action}`, 'User', metadata);
  }

  performance(operation: string, duration: number, metadata?: Record<string, any>) {
    const level = duration > 1000 ? LogLevel.WARN : LogLevel.INFO;
    const message = `Performance: ${operation} took ${duration}ms`;
    
    if (this.shouldLog(level)) {
      this.addLog(this.createLogEntry(level, message, 'Performance', {
        operation,
        duration,
        ...metadata,
      }));
    }
  }

  // Get logs for debugging
  getLogs(level?: LogLevel, context?: string, limit?: number): LogEntry[] {
    let filteredLogs = this.logs;

    if (level !== undefined) {
      filteredLogs = filteredLogs.filter(log => log.level >= level);
    }

    if (context) {
      filteredLogs = filteredLogs.filter(log => log.context === context);
    }

    if (limit) {
      filteredLogs = filteredLogs.slice(-limit);
    }

    return filteredLogs;
  }

  // Export logs for analysis
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
  }

  // Set log level
  setLevel(level: LogLevel) {
    this.currentLevel = level;
  }
}

// Singleton instance
export const logger = new Logger();

// React hook for logging
export const useLogger = (context?: string) => {
  const debug = (message: string, metadata?: Record<string, any>) => 
    logger.debug(message, context, metadata);

  const info = (message: string, metadata?: Record<string, any>) => 
    logger.info(message, context, metadata);

  const warn = (message: string, metadata?: Record<string, any>) => 
    logger.warn(message, context, metadata);

  const error = (message: string, error?: Error, metadata?: Record<string, any>) => 
    logger.error(message, error, context, metadata);

  const apiCall = (method: string, url: string, status?: number, duration?: number) =>
    logger.apiCall(method, url, status, duration);

  const apiError = (method: string, url: string, error: Error, status?: number) =>
    logger.apiError(method, url, error, status);

  const userAction = (action: string, metadata?: Record<string, any>) =>
    logger.userAction(action, metadata);

  const performance = (operation: string, duration: number, metadata?: Record<string, any>) =>
    logger.performance(operation, duration, metadata);

  return {
    debug,
    info,
    warn,
    error,
    apiCall,
    apiError,
    userAction,
    performance,
  };
};
