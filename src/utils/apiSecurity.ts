import { supabase } from '@/integrations/supabase/client';
import { apiRateLimiter, getSecurityHeaders } from '@/utils/security';
import { validateFormData } from '@/utils/validation';

interface SecureApiOptions {
  requireAuth?: boolean;
  enableRateLimit?: boolean;
  validateInput?: boolean;
  timeout?: number;
}

interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

// Secure API wrapper with built-in protections
export const secureApiCall = async <T = any>(
  functionName: string,
  payload?: any,
  options: SecureApiOptions = {}
): Promise<ApiResponse<T>> => {
  const {
    requireAuth = true,
    enableRateLimit = true,
    validateInput = true,
    timeout = 30000
  } = options;

  try {
    // Rate limiting check
    if (enableRateLimit) {
      const rateCheck = apiRateLimiter.check(`function:${functionName}`);
      if (!rateCheck.allowed) {
        return {
          error: 'Rate limit exceeded. Please wait before making another request.',
          status: 429
        };
      }
    }

    // Input validation if payload provided
    if (validateInput && payload) {
      // Basic sanitization for string inputs
      if (typeof payload === 'object') {
        Object.keys(payload).forEach(key => {
          if (typeof payload[key] === 'string') {
            payload[key] = payload[key].trim();
            // Remove potentially dangerous characters
            payload[key] = payload[key].replace(/[<>"']/g, '');
          }
        });
      }
    }

    // Get authentication headers if required
    let headers: Record<string, string> = {};
    if (requireAuth) {
      const session = await supabase.auth.getSession();
      if (!session.data.session?.access_token) {
        return {
          error: 'Authentication required',
          status: 401
        };
      }
      headers.Authorization = `Bearer ${session.data.session.access_token}`;
    }

    // Add security headers
    headers = { ...headers, ...getSecurityHeaders() };

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), timeout);
    });

    // Make the API call with timeout
    const apiPromise = supabase.functions.invoke(functionName, {
      body: payload,
      headers
    });

    const { data, error } = await Promise.race([apiPromise, timeoutPromise]);

    if (error) {
      console.error(`API Error (${functionName}):`, error);
      return {
        error: error.message || 'An error occurred',
        status: 500
      };
    }

    return {
      data,
      status: 200
    };

  } catch (error) {
    console.error(`API Call Failed (${functionName}):`, error);
    return {
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
      status: 500
    };
  }
};

// Secure database query wrapper
export const secureDbQuery = async <T = any>(
  table: string,
  operation: 'select' | 'insert' | 'update' | 'delete',
  queryFn: (client: typeof supabase) => Promise<{ data: T | null; error: any }>,
  options: { requireAuth?: boolean; enableRateLimit?: boolean } = {}
): Promise<ApiResponse<T>> => {
  const { requireAuth = true, enableRateLimit = true } = options;

  try {
    // Rate limiting
    if (enableRateLimit) {
      const rateCheck = apiRateLimiter.check(`db:${table}:${operation}`);
      if (!rateCheck.allowed) {
        return {
          error: 'Too many database requests. Please wait.',
          status: 429
        };
      }
    }

    // Authentication check
    if (requireAuth) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return {
          error: 'Authentication required',
          status: 401
        };
      }
    }

    // Execute query
    const { data, error } = await queryFn(supabase);

    if (error) {
      console.error(`Database Error (${table}):`, error);
      return {
        error: 'Database operation failed',
        status: 500
      };
    }

    return {
      data: data || undefined,
      status: 200
    };

  } catch (error) {
    console.error(`Database Query Failed (${table}):`, error);
    return {
      error: 'An unexpected database error occurred',
      status: 500
    };
  }
};

// File upload security wrapper
export const secureFileUpload = async (
  bucket: string,
  path: string,
  file: File,
  options: { maxSize?: number; allowedTypes?: string[] } = {}
): Promise<ApiResponse<{ path: string; url: string }>> => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
  } = options;

  try {
    // File validation
    if (file.size > maxSize) {
      return {
        error: `File too large. Maximum size is ${Math.round(maxSize / 1024 / 1024)}MB`,
        status: 400
      };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
        status: 400
      };
    }

    // Rate limiting for uploads
    const rateCheck = apiRateLimiter.check('file-upload');
    if (!rateCheck.allowed) {
      return {
        error: 'Upload rate limit exceeded',
        status: 429
      };
    }

    // Authentication check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: 'Authentication required for file upload',
        status: 401
      };
    }

    // Sanitize file path
    const sanitizedPath = path.replace(/[^a-zA-Z0-9._/-]/g, '');
    const fullPath = `${user.id}/${sanitizedPath}`;

    // Upload file
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(fullPath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('File upload error:', error);
      return {
        error: 'File upload failed',
        status: 500
      };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      data: {
        path: data.path,
        url: publicUrl
      },
      status: 200
    };

  } catch (error) {
    console.error('File upload error:', error);
    return {
      error: 'An unexpected upload error occurred',
      status: 500
    };
  }
};

// Security audit logging
export const logSecurityEvent = async (
  eventType: 'auth_attempt' | 'rate_limit' | 'invalid_input' | 'access_denied',
  details: Record<string, any>
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Security Event: ${eventType}`, {
        userId: user?.id || 'anonymous',
        timestamp: new Date().toISOString(),
        ...details
      });
    }

    // In production, you would send this to a logging service
    // await sendToSecurityLogService(eventType, details);
    
  } catch (error) {
    console.error('Failed to log security event:', error);
  }
};