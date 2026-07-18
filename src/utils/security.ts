// Security utilities for the application

// Rate limiting implementation
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 100, windowMs = 60000) { // 100 requests per minute by default
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60000);
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (!entry || now > entry.resetTime) {
      // First request or window expired
      this.limits.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    entry.count++;
    this.limits.set(identifier, entry);

    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }
}

// Create rate limiter instances
export const apiRateLimiter = new RateLimiter(100, 60000); // 100 requests per minute
export const authRateLimiter = new RateLimiter(5, 300000); // 5 auth attempts per 5 minutes
export const uploadRateLimiter = new RateLimiter(10, 60000); // 10 uploads per minute

// CSRF token generation and validation
export const generateCsrfToken = (): string => {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const storeCsrfToken = (token: string): void => {
  sessionStorage.setItem('csrf_token', token);
};

export const getCsrfToken = (): string | null => {
  return sessionStorage.getItem('csrf_token');
};

export const validateCsrfToken = (token: string): boolean => {
  const storedToken = getCsrfToken();
  return storedToken === token && token.length === 32;
};

// Content Security Policy headers
export const getCSPHeaders = () => ({
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.commoditypriceapi.com https://api.oilpriceapi.com https://api.frankfurter.dev https://www.alphavantage.co",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
});

// Secure headers for API responses
export const getSecurityHeaders = () => ({
  ...getCSPHeaders(),
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
});

// Input sanitization
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>"']/g, '') // Remove HTML/script injection characters
    .replace(/javascript:/gi, '') // Remove javascript protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

// Password strength validation
export const validatePasswordStrength = (password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} => {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score += 1;
  else feedback.push('Use at least 8 characters');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Include lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Include uppercase letters');

  if (/\d/.test(password)) score += 1;
  else feedback.push('Include numbers');

  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;
  else feedback.push('Include special characters');

  if (password.length >= 12) score += 1;
  
  return {
    isValid: score >= 4,
    score,
    feedback
  };
};

// AES-GCM encrypted local storage
const ENCRYPTION_KEY_NAME = 'app_enc_key';

async function getOrCreateEncryptionKey(): Promise<CryptoKey> {
  const stored = sessionStorage.getItem(ENCRYPTION_KEY_NAME);
  if (stored) {
    const keyData = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem(ENCRYPTION_KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

export const secureStorage = {
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const encKey = await getOrCreateEncryptionKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(value);
      const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encKey, encoded);
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);
      localStorage.setItem(`secure_${key}`, btoa(String.fromCharCode(...combined)));
    } catch (error) {
      console.error('Failed to store secure item');
    }
  },

  getItem: async (key: string): Promise<string | null> => {
    try {
      const stored = localStorage.getItem(`secure_${key}`);
      if (!stored) return null;
      const encKey = await getOrCreateEncryptionKey();
      const data = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      const iv = data.slice(0, 12);
      const encrypted = data.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, encKey, encrypted);
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      // Key mismatch (new session) - clear stale data
      localStorage.removeItem(`secure_${key}`);
      return null;
    }
  },

  removeItem: (key: string): void => {
    localStorage.removeItem(`secure_${key}`);
  },

  clear: (): void => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('secure_')) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    sessionStorage.removeItem(ENCRYPTION_KEY_NAME);
  }
};

// Session timeout management
export class SessionManager {
  private timeoutId: NodeJS.Timeout | null = null;
  private readonly timeoutDuration: number;
  private onTimeout: () => void;

  constructor(timeoutMinutes = 30, onTimeout: () => void = () => {}) {
    this.timeoutDuration = timeoutMinutes * 60 * 1000;
    this.onTimeout = onTimeout;
    this.resetTimer();
    this.setupActivityListeners();
  }

  private resetTimer(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(() => {
      this.onTimeout();
    }, this.timeoutDuration);
  }

  private setupActivityListeners(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, () => this.resetTimer(), { passive: true });
    });
  }

  destroy(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }
}

// API request signing for additional security
export const signRequest = async (
  url: string, 
  method: string, 
  body?: string,
  secretKey?: string
): Promise<string> => {
  if (!secretKey) return '';
  
  const timestamp = Date.now().toString();
  const message = `${method}${url}${body || ''}${timestamp}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${timestamp}.${hashHex}`;
};

// Verify request signature
export const verifyRequestSignature = async (
  signature: string,
  url: string,
  method: string,
  body?: string,
  secretKey?: string
): Promise<boolean> => {
  if (!signature || !secretKey) return false;
  
  const [timestamp, hash] = signature.split('.');
  if (!timestamp || !hash) return false;
  
  // Check if timestamp is within acceptable range (5 minutes)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  if (Math.abs(now - requestTime) > 5 * 60 * 1000) return false;
  
  const expectedSignature = await signRequest(url, method, body, secretKey);
  const [, expectedHash] = expectedSignature.split('.');
  
  return hash === expectedHash;
};