import React from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSecurityContext } from './SecurityProvider';

interface SecurityCheck {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  description: string;
  recommendation?: string;
}

export const SecurityStatus: React.FC = () => {
  const [securityChecks, setSecurityChecks] = React.useState<SecurityCheck[]>([]);
  const [isVisible, setIsVisible] = React.useState(false);
  const { isSecure, csrfToken } = useSecurityContext();

  React.useEffect(() => {
    const checks: SecurityCheck[] = [
      {
        name: 'HTTPS Connection',
        status: location.protocol === 'https:' ? 'pass' : 'fail',
        description: 'Secure connection using HTTPS',
        recommendation: 'Use HTTPS to encrypt data in transit'
      },
      {
        name: 'CSRF Protection',
        status: csrfToken ? 'pass' : 'fail',
        description: 'Cross-Site Request Forgery protection enabled',
        recommendation: 'CSRF tokens help prevent unauthorized requests'
      },
      {
        name: 'Secure Storage',
        status: 'localStorage' in window && 'sessionStorage' in window ? 'pass' : 'fail',
        description: 'Browser supports secure local storage',
        recommendation: 'Modern browser required for secure data storage'
      },
      {
        name: 'Content Security Policy',
        status: document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? 'pass' : 'warning',
        description: 'Content Security Policy headers configured',
        recommendation: 'CSP helps prevent XSS attacks'
      },
      {
        name: 'Crypto API',
        status: 'crypto' in window && 'subtle' in crypto ? 'pass' : 'fail',
        description: 'Browser supports Web Crypto API',
        recommendation: 'Required for client-side encryption'
      },
      {
        name: 'Authentication',
        status: localStorage.getItem('supabase.auth.token') ? 'pass' : 'warning',
        description: 'User authentication status',
        recommendation: 'Sign in for full security features'
      }
    ];

    setSecurityChecks(checks);
  }, [csrfToken]);

  const getStatusIcon = (status: SecurityCheck['status']) => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: SecurityCheck['status']) => {
    switch (status) {
      case 'pass':
        return 'bg-green-500/10 text-green-700 border-green-200';
      case 'fail':
        return 'bg-red-500/10 text-red-700 border-red-200';
      case 'warning':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
    }
  };

  const passedChecks = securityChecks.filter(check => check.status === 'pass').length;
  const totalChecks = securityChecks.length;
  const securityScore = Math.round((passedChecks / totalChecks) * 100);

  if (!isVisible) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 z-50 shadow-lg"
      >
        <Shield className="w-4 h-4 mr-2" />
        Security Status
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 p-4 shadow-lg border-2">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Security Status</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsVisible(false)}
          className="h-6 w-6 p-0"
        >
          <XCircle className="w-4 h-4" />
        </Button>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Security Score</span>
          <Badge 
            variant={securityScore >= 80 ? 'default' : securityScore >= 60 ? 'secondary' : 'destructive'}
          >
            {securityScore}%
          </Badge>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${
              securityScore >= 80 ? 'bg-green-500' : 
              securityScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${securityScore}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {securityChecks.map((check, index) => (
          <div key={index} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30">
            {getStatusIcon(check.status)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{check.name}</span>
                <Badge 
                  variant="outline" 
                  className={`text-xs ${getStatusColor(check.status)}`}
                >
                  {check.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {check.description}
              </p>
              {check.status !== 'pass' && check.recommendation && (
                <p className="text-xs text-blue-600 mt-1">
                  💡 {check.recommendation}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          {passedChecks}/{totalChecks} security checks passed
        </p>
      </div>
    </Card>
  );
};