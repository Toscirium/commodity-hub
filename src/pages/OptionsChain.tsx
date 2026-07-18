import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Clock, AlertCircle, RefreshCw, Bell, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/sonner';
import { useOptionsChain } from '@/hooks/useOptionsChain';

const OptionsChain: React.FC = () => {
  const navigate = useNavigate();
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null);

  const { refetch, status, error, isFetching } = useOptionsChain('CL', undefined, {
    enabled: false,
    retry: false,
  });

  const handleRefresh = React.useCallback(async () => {
    const result = await refetch();
    setLastChecked(new Date());
    if (result.error) {
      toast.error('Still unavailable', {
        description: 'The options data feed is not reachable right now. Please try again later.',
      });
    } else {
      toast.success('Feed responded', {
        description: 'The options data source is reachable. The full chain viewer will unlock once the integration is finalized.',
      });
    }
  }, [refetch]);

  const handleRemindMe = React.useCallback(() => {
    toast('Reminder saved', {
      description: 'We’ll let you know when the options chain viewer is ready.',
    });
  }, []);

  const state = React.useMemo(() => {
    if (isFetching) {
      return {
        key: 'checking',
        label: 'Checking feed',
        variant: 'outline' as const,
        icon: RefreshCw,
        message: 'Verifying the options data source…',
      };
    }
    if (status === 'success') {
      return {
        key: 'success',
        label: 'Feed available',
        variant: 'default' as const,
        icon: CheckCircle2,
        message: 'The data source is reachable. The full chain viewer will unlock once the integration is finalized.',
      };
    }
    if (status === 'error') {
      return {
        key: 'error',
        label: 'Temporarily unavailable',
        variant: 'destructive' as const,
        icon: AlertCircle,
        message: 'The public options feed is blocking automated access. We’re integrating a licensed data provider.',
      };
    }
    return {
      key: 'soon',
      label: 'Coming soon',
      variant: 'secondary' as const,
      icon: Layers,
      message: 'A professional options chain with Greeks, implied volatility, and strategy tools is on the roadmap.',
    };
  }, [isFetching, status]);

  const StatusIcon = state.icon;

  const errorMessage = React.useMemo(() => {
    if (!error) return null;
    if (error.message === 'Authentication required') {
      return 'Please sign in to refresh the options feed status.';
    }
    return error.message || 'The feed could not be reached.';
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-3xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <CardTitle className="text-xl">Options Chain & Greeks</CardTitle>
            </div>
            <CardDescription>
              Real-time futures options data, implied volatility, and strategy analytics.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="flex items-start gap-4 rounded-xl bg-muted/40 p-4">
              <div className="mt-0.5 shrink-0">
                <div
                  className={`p-2 rounded-full ${
                    state.key === 'error' ? 'bg-destructive/10' : 'bg-primary/10'
                  }`}
                >
                  <StatusIcon
                    className={`w-5 h-5 ${
                      state.key === 'error' ? 'text-destructive' : 'text-primary'
                    } ${state.key === 'checking' ? 'animate-spin' : ''}`}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-sm font-medium text-foreground">Current status</span>
                  <Badge variant={state.variant}>{state.label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{state.message}</p>
                {errorMessage && (
                  <p className="text-xs text-destructive mt-2">
                    {errorMessage}
                  </p>
                )}
                {lastChecked && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last checked: {lastChecked.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <Clock className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                CME Group’s public JSON endpoint is blocking automated access and their Terms of Use prohibit scraping.
                This page will unlock automatically once a licensed data partner (Barchart, CQG, Databento, or similar) is wired in.
              </p>
            </div>
          </CardContent>

          <Separator />

          <CardFooter className="flex flex-col sm:flex-row gap-3 pt-5 pb-5">
            <Button onClick={handleRefresh} disabled={isFetching} className="w-full sm:w-auto gap-2">
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'Checking…' : 'Refresh status'}
            </Button>
            <Button variant="outline" onClick={handleRemindMe} className="w-full sm:w-auto gap-2">
              <Bell className="w-4 h-4" />
              Remind me when ready
            </Button>
            <Button variant="ghost" onClick={() => navigate('/dashboard')} className="w-full sm:w-auto sm:ml-auto">
              Back to Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default OptionsChain;
