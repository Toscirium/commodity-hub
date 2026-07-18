// Common TypeScript types to replace any usage

export type PlainObject = Record<string, unknown>;

export interface EventPayload {
  [key: string]: unknown;
}

export interface ErrorContext {
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PerformanceMetrics {
  [metric: string]: number | string;
}

export interface LogData {
  [key: string]: unknown;
}

export interface ComponentProps {
  [prop: string]: unknown;
}

export interface GenericFunction {
  (...args: unknown[]): unknown;
}

export interface HapticOptions {
  type?: 'impact' | 'notification' | 'selection';
  style?: 'light' | 'medium' | 'heavy';
}

export interface CacheItem<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}