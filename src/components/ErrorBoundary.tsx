import React from 'react';
// Fixed Component reference errors
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { reportReactError } from '@/utils/crashReporting';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showReload?: boolean;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    reportReactError(error, errorInfo);
    this.setState({ error, errorInfo });
    
    // Log error to console for debugging
    console.error('Error details:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    // Use React Router navigation instead of window.location
    const event = new CustomEvent('navigate-home');
    window.dispatchEvent(event);
    // Fallback to window.location if custom event doesn't work
    setTimeout(() => {
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }, 100);
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-md w-full">
            <CardContent className="p-6 text-center space-y-6">
              <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Something went wrong</h2>
                <p className="text-muted-foreground text-sm">
                  We encountered an unexpected error. Don't worry, this has been logged and we'll fix it soon.
                </p>
              </div>

              {this.state.error && (
                <details className="text-left bg-muted/50 rounded-lg p-3">
                  <summary className="text-sm font-medium cursor-pointer mb-2">
                    Error Details
                  </summary>
                  <div className="text-xs font-mono text-muted-foreground space-y-1">
                    <p><strong>Error:</strong> {this.state.error.message}</p>
                    {this.state.errorInfo && (
                      <p><strong>Stack:</strong> {this.state.errorInfo.componentStack}</p>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col gap-2">
                <Button 
                  onClick={this.handleRetry}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                
                <div className="flex gap-2">
                  {this.props.showReload !== false && (
                    <Button 
                      onClick={this.handleReload}
                      variant="outline"
                      className="flex-1"
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Reload Page
                    </Button>
                  )}
                  
                  <Button 
                    onClick={this.handleGoHome}
                    variant="outline"
                    className="flex-1"
                  >
                    <Home className="w-4 h-4 mr-2" />
                    Go Home
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// HOC for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: React.ReactNode
) {
  return function WithErrorBoundaryComponent(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        {React.createElement(WrappedComponent, props)}
      </ErrorBoundary>
    );
  };
}