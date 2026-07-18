import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, TrendingUp, TrendingDown, RefreshCw, Building2, Zap } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatPrice } from '@/lib/commodityUtils';

interface ExchangeFeed {
  commodity: string;
  exchange: string;
  symbol: string;
  description: string;
  dataSource: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  lastUpdate: string | null;
  error: string | null;
  isRealTime: boolean;
}

interface DirectExchangeData {
  success: boolean;
  timestamp: string;
  summary: {
    totalExchanges: number;
    successfulFeeds: number;
    failedFeeds: number;
    exchanges: string[];
    isRealTime: boolean;
    dataDelay: string;
  };
  exchangeFeeds: ExchangeFeed[];
  message: string;
}

export const DirectExchangeFeeds: React.FC = () => {
  const [data, setData] = React.useState<DirectExchangeData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { profile } = useAuth();

  const fetchExchangeFeeds = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) {
        throw new Error('Not authenticated');
      }

      const response = await supabase.functions.invoke('direct-exchange-feeds', {
        headers: {
          Authorization: `Bearer ${authData.session.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch exchange feeds');
      }

      setData(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatFeedPrice = (price: number | null, commodity: string): string => {
    if (price === null) return 'N/A';
    return formatPrice(price, commodity);
  };

  const formatChange = (change: number | null, percent: number | null): JSX.Element => {
    if (change === null || percent === null) return <span className="text-muted-foreground">N/A</span>;
    
    const isPositive = change > 0;
    const colorClass = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    const Icon = isPositive ? TrendingUp : TrendingDown;
    
    return (
      <div className={`flex items-center gap-1 ${colorClass}`}>
        <Icon className="h-3 w-3" />
        <span className="font-medium">
          {isPositive ? '+' : ''}{change.toFixed(2)} ({percent.toFixed(2)}%)
        </span>
      </div>
    );
  };

  const getExchangeColor = (exchange: string) => {
    const colors = {
      'NYMEX': 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400',
      'COMEX': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
      'ICE': 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
      'CBOT': 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
      'CME': 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400'
    };
    return colors[exchange] || 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
  };

  const isPremium = profile?.subscription_active && profile?.subscription_tier !== 'free';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Direct Exchange Feeds
          </div>
          <Button
            onClick={fetchExchangeFeeds}
            disabled={loading}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Refresh Feeds'}
          </Button>
        </CardTitle>
        <CardDescription>
          Real-time prices directly from major commodity exchanges (NYMEX, COMEX, ICE, CBOT, CME)
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {error && (
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold">{data.summary.totalExchanges}</div>
                  <p className="text-sm text-muted-foreground">Total Feeds</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-green-600">{data.summary.successfulFeeds}</div>
                  <p className="text-sm text-muted-foreground">Active Feeds</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-red-600">{data.summary.failedFeeds}</div>
                  <p className="text-sm text-muted-foreground">Failed Feeds</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    {data.summary.isRealTime ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <Zap className="h-4 w-4" />
                        <span className="font-bold">LIVE</span>
                      </div>
                    ) : (
                      <span className="text-orange-600 font-bold">15-MIN DELAY</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Data Feed</p>
                </CardContent>
              </Card>
            </div>

            {/* Exchange Overview */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm font-medium text-muted-foreground">Active Exchanges:</span>
              {data.summary.exchanges.map(exchange => (
                <Badge key={exchange} className={getExchangeColor(exchange)}>
                  {exchange}
                </Badge>
              ))}
            </div>

            {/* Detailed Feeds Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Commodity</TableHead>
                    <TableHead>Exchange</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.exchangeFeeds.map((feed) => (
                    <TableRow key={`${feed.exchange}-${feed.symbol}`}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{feed.commodity}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-40">
                            {feed.description}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getExchangeColor(feed.exchange)}>
                          {feed.exchange}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 rounded">{feed.symbol}</code>
                      </TableCell>
                      <TableCell>
                        {feed.error ? (
                          <Badge variant="destructive" className="text-xs">
                            {feed.error}
                          </Badge>
                        ) : (
                          <div>
                            <div className="font-medium">{formatFeedPrice(feed.price, feed.commodity)}</div>
                            {feed.lastUpdate && (
                              <div className="text-xs text-muted-foreground">
                                {new Date(feed.lastUpdate).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {formatChange(feed.change, feed.changePercent)}
                      </TableCell>
                      <TableCell>
                        {feed.price !== null ? (
                          <div className="flex items-center gap-1">
                            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-green-600 font-medium">LIVE</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <div className="h-2 w-2 bg-red-500 rounded-full"></div>
                            <span className="text-xs text-red-600 font-medium">OFFLINE</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <div>Last updated: {new Date(data.timestamp).toLocaleString()}</div>
              <div>{data.message}</div>
            </div>
          </div>
        )}

        {!data && !loading && (
          <div className="text-center py-8">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Click "Refresh Feeds" to load direct exchange data</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};