import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionsChain, type OptionsProduct } from '@/hooks/useOptionsChain';
import { MarketDataProvenance } from '@/components/MarketDataProvenance';
import PremiumPaywall from '@/components/PremiumPaywall';
import { downloadCsv } from '@/utils/csvExport';

const PRODUCTS: { value: OptionsProduct; label: string }[] = [
  { value: 'CL', label: 'WTI Crude Oil' },
  { value: 'NG', label: 'Natural Gas' },
  { value: 'GC', label: 'Gold' },
  { value: 'ZC', label: 'Corn' },
  { value: 'ZS', label: 'Soybeans' },
];

const num = (v: number | null, decimals = 2) => (v == null ? '—' : v.toFixed(decimals));
const iv = (v: number | null) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);

const OptionsChain: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [product, setProduct] = React.useState<OptionsProduct>('CL');
  const [expiration, setExpiration] = React.useState<string | undefined>(undefined);

  const { data, isLoading, isFetching, error, refetch } = useOptionsChain(product, expiration, {
    enabled: isPro,
  });

  // Reset the selected expiration when switching products, so we don't carry
  // over an expiration code that doesn't exist for the new product.
  const handleProductChange = (next: OptionsProduct) => {
    setProduct(next);
    setExpiration(undefined);
  };

  const errorMessage = React.useMemo(() => {
    if (!error) return null;
    const message = error.message || 'The options feed could not be reached.';
    if (message === 'Authentication required') return 'Please sign in to load the options chain.';
    if (message.includes('not configured')) return 'The options data source is not configured yet.';
    return message;
  }, [error]);

  const atmStrike = React.useMemo(() => {
    if (!data?.rows.length || data.underlying == null) return null;
    return data.rows.reduce((closest, row) =>
      Math.abs(row.strike - data.underlying!) < Math.abs(closest.strike - data.underlying!) ? row : closest
    ).strike;
  }, [data]);

  const handleExportCsv = () => {
    if (!data) return;
    downloadCsv(
      `options-chain-${data.product}-${data.expiration}.csv`,
      ['Strike', 'Call Settle', 'Call Volume', 'Call OI', 'Call IV', 'Put Settle', 'Put Volume', 'Put OI', 'Put IV'],
      data.rows.map((row) => [
        row.strike,
        row.callSettle ?? '',
        row.callVolume ?? '',
        row.callOpenInterest ?? '',
        row.callIV ?? '',
        row.putSettle ?? '',
        row.putVolume ?? '',
        row.putOpenInterest ?? '',
        row.putIV ?? '',
      ]),
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-6xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="w-6 h-6 text-primary" />
              Options Chain
              <Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              CME futures-options settlements, open interest, and implied volatility by strike.
            </p>
          </div>
          {isPro && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!data?.rows.length}>
                <Download className="w-4 h-4 mr-2" /> CSV
              </Button>
            </div>
          )}
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Options Chain is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Full CME futures-options chains with settlements, open interest, and implied volatility
                  for crude oil, natural gas, gold, corn, and soybeans.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-4">
              <CardContent className="pt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  {PRODUCTS.map((p) => (
                    <Button
                      key={p.value}
                      size="sm"
                      variant={product === p.value ? 'default' : 'outline'}
                      onClick={() => handleProductChange(p.value)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
                {data && data.expirations.length > 0 && (
                  <Select value={data.expiration} onValueChange={setExpiration}>
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Expiration" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.expirations.map((exp) => (
                        <SelectItem key={exp.code} value={exp.code}>{exp.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>

            {isLoading && <p className="text-sm text-muted-foreground">Loading options chain…</p>}

            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 flex items-start gap-3 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {errorMessage}
                </CardContent>
              </Card>
            )}

            {data && !error && (
              <>
                <div className="mb-4">
                  <MarketDataProvenance
                    provenance={{
                      status: 'eod',
                      source: 'Databento (CME Globex GLBX.MDP3)',
                      asOf: data.tradeDate,
                      refreshLabel: data.underlying != null
                        ? `Underlying ${data.productLabel.replace(' Options', '')} ${data.underlying.toFixed(2)}`
                        : undefined,
                    }}
                  />
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{data.productLabel}</CardTitle>
                    <CardDescription>
                      Expiration {data.expirationDate ?? data.expiration} · {data.rows.length} strikes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    {data.rows.length === 0 ? (
                      <p className="p-4 text-sm text-muted-foreground">No strikes available for this expiration.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="p-2 text-right font-medium" colSpan={4}>Calls</th>
                            <th className="p-2 text-center font-medium">Strike</th>
                            <th className="p-2 text-left font-medium" colSpan={4}>Puts</th>
                          </tr>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="p-2 text-right font-medium">IV</th>
                            <th className="p-2 text-right font-medium">OI</th>
                            <th className="p-2 text-right font-medium">Vol</th>
                            <th className="p-2 text-right font-medium">Settle</th>
                            <th className="p-2 text-center font-medium"> </th>
                            <th className="p-2 text-left font-medium">Settle</th>
                            <th className="p-2 text-left font-medium">Vol</th>
                            <th className="p-2 text-left font-medium">OI</th>
                            <th className="p-2 text-left font-medium">IV</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.rows.map((row) => (
                            <tr
                              key={row.strike}
                              className={`border-b border-border/60 last:border-0 ${row.strike === atmStrike ? 'bg-primary/5' : ''}`}
                            >
                              <td className="p-2 text-right font-mono text-xs text-muted-foreground">{iv(row.callIV)}</td>
                              <td className="p-2 text-right font-mono text-xs text-muted-foreground">{row.callOpenInterest ?? '—'}</td>
                              <td className="p-2 text-right font-mono text-xs text-muted-foreground">{row.callVolume ?? '—'}</td>
                              <td className="p-2 text-right font-mono font-medium">{num(row.callSettle)}</td>
                              <td className={`p-2 text-center font-mono font-semibold ${row.strike === atmStrike ? 'text-primary' : ''}`}>
                                {row.strike}
                              </td>
                              <td className="p-2 text-left font-mono font-medium">{num(row.putSettle)}</td>
                              <td className="p-2 text-left font-mono text-xs text-muted-foreground">{row.putVolume ?? '—'}</td>
                              <td className="p-2 text-left font-mono text-xs text-muted-foreground">{row.putOpenInterest ?? '—'}</td>
                              <td className="p-2 text-left font-mono text-xs text-muted-foreground">{iv(row.putIV)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default OptionsChain;
