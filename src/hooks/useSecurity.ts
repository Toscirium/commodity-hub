import React from 'react';
// Force rebuild to fix useState error
import { useToast } from '@/hooks/use-toast';
import { 
  apiRateLimiter, 
  authRateLimiter, 
  uploadRateLimiter,
  generateCsrfToken,
  storeCsrfToken,
  getCsrfToken,
  validateCsrfToken,
  SessionManager
} from '@/utils/security';
import { validateFormData } from '@/utils/validation';

interface SecurityConfig {
  enableRateLimit?: boolean;
  enableCsrfProtection?: boolean;
  sessionTimeoutMinutes?: number;
}

interface SecurityHook {
  checkRateLimit: (type: 'api' | 'auth' | 'upload', identifier?: string) => boolean;
  csrfToken: string;
  validateCsrf: (token: string) => boolean;
  refreshCsrfToken: () => void;
  validateInput: (type: string, value: any) => { isValid: boolean; error?: string; value?: any };
  getSecurityHeaders: () => Record<string, string>;
  extendSession: () => void;
  isSessionActive: boolean;
}

export const useSecurity = (config: SecurityConfig = {}): SecurityHook => {
  const {
    enableRateLimit = true,
    enableCsrfProtection = true,
    sessionTimeoutMinutes = 30
  } = config;

  const [csrfToken, setCsrfToken] = React.useState<string>('');
  const [isSessionActive, setIsSessionActive] = React.useState(true);
  const [sessionManager, setSessionManager] = React.useState<SessionManager | null>(null);
  const { toast } = useToast();

  // Initialize CSRF token
  React.useEffect(() => {
    if (enableCsrfProtection) {
      let token = getCsrfToken();
      if (!token) {
        token = generateCsrfToken();
        storeCsrfToken(token);
      }
      setCsrfToken(token);
    }
  }, [enableCsrfProtection]);

  // Initialize session manager
  React.useEffect(() => {
    const manager = new SessionManager(
      sessionTimeoutMinutes,
      () => {
        setIsSessionActive(false);
        toast({
          title: "Session Expired",
          description: "Your session has expired. Please sign in again.",
          variant: "destructive",
        });
      }
    );
    setSessionManager(manager);

    return () => {
      manager.destroy();
    };
  }, [sessionTimeoutMinutes, toast]);

  const checkRateLimit = React.useCallback((
    type: 'api' | 'auth' | 'upload', 
    identifier: string = 'default'
  ): boolean => {
    if (!enableRateLimit) return true;

    let limiter;
    switch (type) {
      case 'api':
        limiter = apiRateLimiter;
        break;
      case 'auth':
        limiter = authRateLimiter;
        break;
      case 'upload':
        limiter = uploadRateLimiter;
        break;
      default:
        return true;
    }

    const result = limiter.check(identifier);
    
    if (!result.allowed) {
      toast({
        title: "Rate Limit Exceeded",
        description: `Too many ${type} requests. Please wait before trying again.`,
        variant: "destructive",
      });
      return false;
    }

    if (result.remaining <= 5) {
      toast({
        title: "Rate Limit Warning",
        description: `You have ${result.remaining} ${type} requests remaining.`,
        variant: "default",
      });
    }

    return true;
  }, [enableRateLimit, toast]);

  const validateCsrf = React.useCallback((token: string): boolean => {
    if (!enableCsrfProtection) return true;
    
    const isValid = validateCsrfToken(token);
    if (!isValid) {
      toast({
        title: "Security Error",
        description: "Invalid security token. Please refresh the page.",
        variant: "destructive",
      });
    }
    return isValid;
  }, [enableCsrfProtection, toast]);

  const refreshCsrfToken = React.useCallback(() => {
    if (enableCsrfProtection) {
      const newToken = generateCsrfToken();
      storeCsrfToken(newToken);
      setCsrfToken(newToken);
    }
  }, [enableCsrfProtection]);

  const validateInput = React.useCallback((
    type: string,
    value: any
  ): { isValid: boolean; error?: string; value?: any } => {
    try {
      if (type in validateFormData) {
        const validator = validateFormData[type as keyof typeof validateFormData];
        const validatedValue = (validator as any)(value);
        return { isValid: true, value: validatedValue };
      }
      return { isValid: false, error: 'Unknown validation type' };
    } catch (error: any) {
      const errorMessage = error?.issues?.[0]?.message || error?.message || 'Invalid input';
      return { isValid: false, error: errorMessage };
    }
  }, []);

  const getSecurityHeaders = React.useCallback(() => ({
    'X-CSRF-Token': csrfToken,
    'X-Requested-With': 'XMLHttpRequest',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff'
  }), [csrfToken]);

  const extendSession = React.useCallback(() => {
    if (sessionManager && isSessionActive) {
      setIsSessionActive(true);
    }
  }, [sessionManager, isSessionActive]);

  return {
    checkRateLimit,
    csrfToken,
    validateCsrf,
    refreshCsrfToken,
    validateInput,
    getSecurityHeaders,
    extendSession,
    isSessionActive
  };
};

export const withSecurity = (
  Component: React.ComponentType<any>,
  securityConfig?: SecurityConfig
) => {
  return (props: any) => {
    const security = useSecurity(securityConfig);
    
    React.useEffect(() => {
      security.extendSession();
    }, [security]);

    if (!security.isSessionActive) {
      return React.createElement('div', { className: 'min-h-screen flex items-center justify-center' },
        React.createElement('div', { className: 'text-center space-y-4' },
          React.createElement('h2', { className: 'text-xl font-semibold' }, 'Session Expired'),
          React.createElement('p', { className: 'text-muted-foreground' }, 'Please sign in again to continue.')
        )
      );
    }

    return React.createElement(Component, props);
  };
};