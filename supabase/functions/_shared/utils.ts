import { CorsHeaders, LogContext, ApiResponse } from './types.ts';
import { sanitize, sanitizeForLog } from './sanitize.ts';

// Standard CORS headers for all edge functions
export const corsHeaders: CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

// Performance monitoring integration
export class EdgePerformanceMonitor {
  private metrics: Array<{
    name: string;
    duration: number;
    timestamp: number;
    metadata?: Record<string, any>;
  }> = [];

  startTimer(name: string): () => void {
    const startTime = Date.now();
    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric(name, duration);
    };
  }

  recordMetric(name: string, duration: number, metadata?: Record<string, any>) {
    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    });

    // Keep only last 100 metrics to prevent memory leaks
    if (this.metrics.length > 100) {
      this.metrics = this.metrics.slice(-100);
    }

    // Log slow operations
    if (duration > 5000) {
      console.warn(`Slow operation detected: ${name} took ${duration}ms`);
    }
  }

  getMetrics() {
    return [...this.metrics];
  }

  getAverageTime(operationName: string): number {
    const relevant = this.metrics.filter(m => m.name === operationName);
    if (relevant.length === 0) return 0;
    return relevant.reduce((sum, m) => sum + m.duration, 0) / relevant.length;
  }
}

// Enhanced logging utility for edge functions
export class EdgeLogger {
  private context: LogContext;

  constructor(context: LogContext) {
    this.context = context;
  }

  private formatMessage(level: string, message: string, details?: any): string {
    const timestamp = new Date().toISOString();
    const safeMessage = typeof message === 'string'
      ? (sanitize(message) as string)
      : sanitizeForLog(message);
    const detailsStr = details !== undefined ? ` - ${sanitizeForLog(details)}` : '';
    return `[${timestamp}] [${this.context.functionName}] ${level}: ${safeMessage}${detailsStr}`;
  }

  info(message: string, details?: any) {
    console.log(this.formatMessage('INFO', message, details));
  }

  warn(message: string, details?: any) {
    console.warn(this.formatMessage('WARN', message, details));
  }

  error(message: string, error?: Error | unknown, details?: any) {
    // Strip stack traces by default — they can leak file paths and inlined values.
    const errorDetails = error instanceof Error
      ? { errorName: error.name, errorMessage: error.message, ...details }
      : { error, ...details };
    console.error(this.formatMessage('ERROR', message, errorDetails));
  }

  debug(message: string, details?: any) {
    console.debug(this.formatMessage('DEBUG', message, details));
  }

  step(step: string, details?: any) {
    this.info(`Step: ${step}`, details);
  }
}

// Response helpers
export function successResponse<T>(data: T, message?: string): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message,
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

export function errorResponse(
  error: string | Error,
  status: number = 500,
  details?: any
): Response {
  // Log full error server-side, return generic message to client
  if (error instanceof Error) {
    console.error('[errorResponse] Internal error:', sanitizeForLog({
      name: error.name,
      message: error.message,
    }));
  }
  const message = typeof error === 'string' ? error : 'An error occurred processing your request';
  const response: ApiResponse = {
    success: false,
    error: message,
  };

  return new Response(JSON.stringify(response), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

export function corsResponse(): Response {
  return new Response(null, { headers: corsHeaders });
}

// Authentication helpers
export function getBearerToken(authHeader: string | null): string | null {
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  return token || null;
}

export function jwtHasSubject(token: string | null): boolean {
  if (!token) return false;
  const payload = token.split('.')[1];
  if (!payload) return false;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded));
    return typeof decoded?.sub === 'string' && decoded.sub.length > 0;
  } catch {
    return false;
  }
}

export function getUserAuthorizationHeader(authHeader: string | null): string | undefined {
  const token = getBearerToken(authHeader);
  return jwtHasSubject(token) ? `Bearer ${token}` : undefined;
}

export async function getOptionalAuthenticatedUser(
  supabaseClient: any,
  authHeader: string | null
): Promise<any | null> {
  const token = getBearerToken(authHeader);
  if (!jwtHasSubject(token)) return null;

  try {
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export async function authenticateUser(
  supabaseClient: any,
  authHeader: string | null
): Promise<{ user: any; error?: string }> {
  if (!authHeader) {
    return { user: null, error: 'No authorization header provided' };
  }

  try {
    const token = getBearerToken(authHeader);
    if (!token || !jwtHasSubject(token)) {
      return { user: null, error: 'Invalid or expired token' };
    }
    const { data, error } = await supabaseClient.auth.getUser(token);
    
    if (error || !data.user) {
      return { user: null, error: 'Invalid or expired token' };
    }

    return { user: data.user };
  } catch (error) {
    console.error('Authentication error:', error);
    return { 
      user: null, 
      error: 'Authentication failed'
    };
  }
}

// Validation helpers
export function validateRequired(
  data: Record<string, any>,
  requiredFields: string[]
): { isValid: boolean; missingFields: string[] } {
  const missingFields = requiredFields.filter(field => 
    data[field] === undefined || data[field] === null || data[field] === ''
  );

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}

// Rate limiting (simple in-memory implementation)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 60000
): { allowed: boolean; resetTime: number } {
  const now = Date.now();
  const key = identifier;
  
  const current = rateLimitMap.get(key);
  
  if (!current || now > current.resetTime) {
    // Reset or create new entry
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, resetTime: now + windowMs };
  }
  
  if (current.count >= maxRequests) {
    return { allowed: false, resetTime: current.resetTime };
  }
  
  current.count++;
  return { allowed: true, resetTime: current.resetTime };
}

// Retry utility for external API calls
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

// Data transformation helpers
export function sanitizeForJson(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'object') {
    if (Array.isArray(data)) {
      return data.map(item => sanitizeForJson(item));
    }
    
    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      // Skip functions and undefined values
      if (typeof value !== 'function' && value !== undefined) {
        sanitized[key] = sanitizeForJson(value);
      }
    }
    return sanitized;
  }
  
  return data;
}

// Environment variable helpers
export function getRequiredEnvVar(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

export function getOptionalEnvVar(name: string, defaultValue?: string): string | undefined {
  return Deno.env.get(name) || defaultValue;
}

// Database operation helpers
export async function withTransaction<T>(
  supabaseClient: any,
  operation: (client: any) => Promise<T>
): Promise<T> {
  // Note: Supabase doesn't have native transaction support in the client
  // This is a placeholder for future transaction implementation
  return await operation(supabaseClient);
}

// Cache utilities (simple in-memory cache)
const cache = new Map<string, { data: any; expiry: number }>();

export function getCachedData<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiry) {
    return cached.data;
  }
  cache.delete(key);
  return null;
}

export function setCachedData<T>(key: string, data: T, ttlMs: number = 300000): void {
  cache.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  });
}

export function clearCache(): void {
  cache.clear();
}

// Cleanup expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now >= value.expiry) {
      cache.delete(key);
    }
  }
}, 60000); // Clean up every minute