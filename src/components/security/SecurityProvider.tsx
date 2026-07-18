import React from 'react';
import { useSecurity } from '@/hooks/useSecurity';
import { useToast } from '@/hooks/use-toast';

interface SecurityContextType {
  isSecure: boolean;
  checkRateLimit: (type: 'api' | 'auth' | 'upload', identifier?: string) => boolean;
  validateInput: (type: string, value: any) => { isValid: boolean; error?: string; value?: any };
  csrfToken: string;
  refreshCsrfToken: () => void;
}

const SecurityContext = React.createContext<SecurityContextType | undefined>(undefined);

export const useSecurityContext = () => {
  const context = React.useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurityContext must be used within SecurityProvider');
  }
  return context;
};

interface SecurityProviderProps {
  children: React.ReactNode;
  config?: {
    enableRateLimit?: boolean;
    enableCsrfProtection?: boolean;
    sessionTimeoutMinutes?: number;
  };
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ 
  children, 
  config = {} 
}) => {
  const [isSecure, setIsSecure] = React.useState(false);
  const { toast } = useToast();
  
  const security = useSecurity({
    enableRateLimit: config.enableRateLimit ?? true,
    enableCsrfProtection: config.enableCsrfProtection ?? true,
    sessionTimeoutMinutes: config.sessionTimeoutMinutes ?? 30
  });

  // Initialize security features
  React.useEffect(() => {
    // Check if browser supports required security features
    const hasRequiredFeatures = [
      'crypto',
      'localStorage',
      'sessionStorage'
    ].every(feature => feature in window);

    if (!hasRequiredFeatures) {
      toast({
        title: "Security Warning",
        description: "Your browser doesn't support all required security features.",
        variant: "destructive",
      });
      setIsSecure(false);
      return;
    }

    // Check for HTTPS in production
    if (process.env.NODE_ENV === 'production' && location.protocol !== 'https:') {
      toast({
        title: "Security Warning",
        description: "Insecure connection detected. Please use HTTPS.",
        variant: "destructive",
      });
      setIsSecure(false);
      return;
    }

    setIsSecure(true);
  }, [toast]);

  // Monitor for security violations
  React.useEffect(() => {
    const handleSecurityViolation = (event: SecurityPolicyViolationEvent) => {
      console.warn('Content Security Policy violation:', event);
      toast({
        title: "Security Alert",
        description: "A security policy violation was detected.",
        variant: "destructive",
      });
    };

    document.addEventListener('securitypolicyviolation', handleSecurityViolation);
    
    return () => {
      document.removeEventListener('securitypolicyviolation', handleSecurityViolation);
    };
  }, [toast]);

  const value: SecurityContextType = {
    isSecure,
    checkRateLimit: security.checkRateLimit,
    validateInput: security.validateInput,
    csrfToken: security.csrfToken,
    refreshCsrfToken: security.refreshCsrfToken
  };

  // Show security warning if not secure
  if (!isSecure) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="max-w-md p-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 19c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-destructive">Security Requirements Not Met</h2>
          <p className="text-sm text-muted-foreground">
            Your browser or connection doesn't meet the required security standards.
            Please ensure you're using a modern browser with HTTPS.
          </p>
          <button 
            onClick={() => location.reload()} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};