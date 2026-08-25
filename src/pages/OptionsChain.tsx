import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Layers, Lock, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionsChain, type OptionsProduct, type OptionsChainRow } from '@/hooks/useOptionsChain';
import { MarketDataProvenance } from '@/components/MarketDataProvenance';
import PremiumPaywall from '@/components/PremiumPaywall';
import EliteWaitlistCard from '@/components/EliteWaitlistCard';
import { downloadCsv } from '@/utils/csvExport';
import { impliedVol, daysToT } from '@/utils/blackScholes';

// CME/Databento don't publish IV for these products via the statistics feed
// (confirmed against live responses — every row comes back with callIV/putIV
// null), so we solve for it ourselves from the settlement price. No live
// risk-free-rate feed is wired up, so this uses a fixed short-term-rate
// approximation rather than a precise curve point — fine for an estimate
// that's already clearly marked as such in the UI, not for a Greeks desk.
const FALLBACK_RISK_FREE_RATE = 0.05;

interface ResolvedIV { value: number | null; estimated: boolean }

const PRODUCTS: { value: OptionsProduct; label: string }[] = [
  { value: 'CL', label: 'WTI Crude Oil' },
  { value: 'NG', label: 'Natural Gas' },
  { value: 'GC', label: 'Gold' },
  { value: 'ZC', label: 'Corn' },
  { value: 'ZS', label: 'Soybeans' },
];

const num = (v: number | null, decimals = 2) => (v == null ? '—' : v.toFixed(decimals));

const IvCell = ({ iv }: { iv: ResolvedIV }) => {
  if (iv.value == null) return <span className="text-muted-foreground">—</span>;
  const text = `${(iv.value * 100).toFixed(1)}%`;
  if (!iv.estimated) return <span className="text-muted-foreground">{text}</span>;
  return (
    <span
      className="text-muted-foreground/70 italic"
      title="Estimated via Black-76 from the settlement price — CME does not publish IV for this product, so this is not an exchange-quoted value"
    >
      ~{text}
    </span>
  );
};

/** Ticks once a second while `active`, resetting to 0 whenever it flips on — used to show the user real progress on a slow request instead of a static spinner. */
const useElapsedSeconds = (active: boolean): number => {
  const [seconds, setSeconds] = React.useState(0);
  React.useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const start = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
};

// Databento's historical API generates a full options-universe snapshot per
// request rather than serving a pre-built chain, so a cold (uncached) load
// routinely takes 30-60s — a skeleton + elapsed timer keeps that from
// reading as a hang, since a bare spinner past ~10s starts to look broken.
const ChainSkeleton = ({ seconds }: { seconds: number }) => (
  <Card>
    <CardContent className="p-4">
      <p className="mb-4 text-sm text-muted-foreground">
        Pulling live settlements, open interest, and volatility from CME via Databento…
        {seconds > 0 && ` (${seconds}s — first load of a product/expiration can take up to a minute)`}
      </p>
      <div className="space-y-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="grid grid-cols-9 items-center gap-2">
            <Skeleton className="h-4 w-10 justify-self-end" />
            <Skeleton className="h-4 w-10 justify-self-end" />
            <Skeleton className="h-4 w-8 justify-self-end" />
            <Skeleton className="h-4 w-12 justify-self-end" />
            <Skeleton className="h-4 w-10 justify-self-center" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-10" />
            <Skeleton className="h-4 w-10" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

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
  const loadingSeconds = useElapsedSeconds(isLoading);

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

  // Time-to-expiry as of the settlement (trade) date, not "now" — the
  // settle price we're solving from is priced as of tradeDate.
  const yearsToExpiry = React.useMemo(() => {
    if (!data?.tradeDate) return null;
    const expiryDate = data.expirationDate ?? data.expiration;
    const tradeMs = Date.parse(`${data.tradeDate}T00:00:00Z`);
    const expiryMs = Date.parse(`${expiryDate}T00:00:00Z`);
    if (!Number.isFinite(tradeMs) || !Number.isFinite(expiryMs)) return null;
    return daysToT((expiryMs - tradeMs) / 86_400_000);
  }, [data]);

  const resolveIv = React.useCallback(
    (settle: number | null, publishedIv: number | null, strike: number, type: 'call' | 'put'): ResolvedIV => {
      if (publishedIv != null) return { value: publishedIv, estimated: false };
      if (settle == null || data?.underlying == null || !yearsToExpiry || yearsToExpiry <= 0) {
        return { value: null, estimated: false };
      }
      const solved = impliedVol(settle, data.underlying, strike, yearsToExpiry, FALLBACK_RISK_FREE_RATE, type);
      // Deep-OTM strikes often settle at the exchange's minimum tick (e.g.
      // $0.01), which isn't really pricing time value — solving IV from that
      // is numerically unstable and produces implausible vols (200%+). Treat
      // those as unreliable rather than displaying a misleading number.
      if (solved != null && solved > 3) return { value: null, estimated: false };
      return { value: solved, estimated: solved != null };
    },
    [data?.underlying, yearsToExpiry],
  );

  const resolvedRows = React.useMemo(() => {
    if (!data) return [];
    return data.rows.map((row: OptionsChainRow) => ({
      row,
      callIv: resolveIv(row.callSettle, row.callIV, row.strike, 'call'),
      putIv: resolveIv(row.putSettle, row.putIV, row.strike, 'put'),
    }));
  }, [data, resolveIv]);

  const handleExportCsv = () => {
    if (!data) return;
    downloadCsv(
      `options-chain-${data.product}-${data.expiration}.csv`,
      ['Strike', 'Call Settle', 'Call Volume', 'Call OI', 'Call IV', 'Call IV Source', 'Put Settle', 'Put Volume', 'Put OI', 'Put IV', 'Put IV Source'],
      resolvedRows.map(({ row, callIv, putIv }) => [
        row.strike,
        row.callSettle ?? '',
        row.callVolume ?? '',
        row.callOpenInterest ?? '',
        callIv.value ?? '',
        callIv.value == null ? '' : callIv.estimated ? 'estimated (Black-76)' : 'exchange',
        row.putSettle ?? '',
        row.putVolume ?? '',
        row.putOpenInterest ?? '',
        putIv.value ?? '',
        putIv.value == null ? '' : putIv.estimated ? 'estimated (Black-76)' : 'exchange',
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
            <EliteWaitlistCard source="options_chain" className="mb-4" />

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

            {isLoading && <ChainSkeleton seconds={loadingSeconds} />}

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
                      {resolvedRows.some((r) => r.callIv.estimated || r.putIv.estimated) && (
                        <span className="ml-2 italic text-muted-foreground/70">· ~IV is a Black-76 estimate, not exchange-quoted</span>
                      )}
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
                          {resolvedRows.map(({ row, callIv, putIv }) => (
                            <tr
                              key={row.strike}
                              className={`border-b border-border/60 last:border-0 ${row.strike === atmStrike ? 'bg-primary/5' : ''}`}
                            >
                              <td className="p-2 text-right font-mono text-xs"><IvCell iv={callIv} /></td>
                              <td className="p-2 text-right font-mono text-xs text-muted-foreground">{row.callOpenInterest ?? '—'}</td>
                              <td className="p-2 text-right font-mono text-xs text-muted-foreground">{row.callVolume ?? '—'}</td>
                              <td className="p-2 text-right font-mono font-medium">{num(row.callSettle)}</td>
                              <td className={`p-2 text-center font-mono font-semibold ${row.strike === atmStrike ? 'text-primary' : ''}`}>
                                {row.strike}
                              </td>
                              <td className="p-2 text-left font-mono font-medium">{num(row.putSettle)}</td>
                              <td className="p-2 text-left font-mono text-xs text-muted-foreground">{row.putVolume ?? '—'}</td>
                              <td className="p-2 text-left font-mono text-xs text-muted-foreground">{row.putOpenInterest ?? '—'}</td>
                              <td className="p-2 text-left font-mono text-xs"><IvCell iv={putIv} /></td>
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
