import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Activity, Lock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ComposedChart, Bar, Line, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useVolCone, MASSIVE_ANALYTICS_PRODUCTS } from '@/hooks/useMassiveAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';

const VolatilityCone: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [commodity, setCommodity] = useState('gold');
  const { data, isLoading, error, refetch, isFetching } = useVolCone(isPro ? commodity : null);

  const chartData = (data?.cone ?? []).map((b) => ({
    window: `${b.window}d`,
    range: b.min != null && b.max != null ? [b.min, b.max] : undefined,
    iqr: b.p25 != null && b.p75 != null ? [b.p25, b.p75] : undefined,
    median: b.median,
    current: b.current,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Volatility Cone
              <Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Annualized realized vol vs 5-year historical distribution across 10/20/60/120-day windows.
            </p>
          </div>
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Volatility Cone is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Spot when realized vol is rich or cheap relative to its own 5-year history — essential for options sizing and risk.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <div className="w-full max-w-xs">
                <Select value={commodity} onValueChange={setCommodity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MASSIVE_ANALYTICS_PRODUCTS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Computing realized vol from 5y of settlements…</p>}
            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">
                  Couldn't load history. The product may not have enough settled bars yet.
                </CardContent>
              </Card>
            )}
            {data && (
              <>
                {data.stale && (
                  <div className="mb-3 px-3 py-2 text-xs rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    Refreshing in the background — showing last cached snapshot ({data.asOf ? new Date(data.asOf).toLocaleString() : '—'}). New data will appear on next load.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>
                        Current {(data as { headlineWindow?: number }).headlineWindow ?? 20}-day Vol
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {data.currentVol != null ? `${data.currentVol.toFixed(2)}%` : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Annualized, log returns</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>1Y Percentile</CardDescription></CardHeader>
                    <CardContent>
                      {data.percentile1y != null ? (
                        <>
                          <div className={`text-2xl font-bold ${data.percentile1y > 80 ? 'text-orange-400' : data.percentile1y < 20 ? 'text-emerald-400' : ''}`}>
                            {data.percentile1y}%
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {data.percentile1y > 80 ? 'Vol is RICH vs last year' : data.percentile1y < 20 ? 'Vol is CHEAP vs last year' : 'Vol is in normal range'}
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="text-2xl font-bold">—</div>
                          <p className="text-xs text-muted-foreground mt-1">Not enough settled bars yet</p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Sample</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{data.bars}</div>
                      <p className="text-xs text-muted-foreground mt-1">Daily bars · asOf {data.asOf}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardDescription>{data.label} — Realized Vol Cone (5y range, IQR, current vs median)</CardDescription>
                  </CardHeader>
                  <CardContent className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ top: 10, right: 24, left: 4, bottom: 8 }}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                        <XAxis dataKey="window" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} />
                        <YAxis stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                        <Tooltip
                          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
                          formatter={(v: any, n: any) => [Array.isArray(v) ? `${v[0]}% – ${v[1]}%` : `${v}%`, n]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="range" name="5y Min–Max" fill="hsl(var(--muted))" fillOpacity={0.4} />
                        <Bar dataKey="iqr" name="25–75% IQR" fill="hsl(var(--primary))" fillOpacity={0.5} />
                        <Line type="monotone" dataKey="median" name="Median" stroke="hsl(var(--foreground))" strokeWidth={2} dot={{ r: 3 }} />
                        <Scatter dataKey="current" name="Current" fill="#f59e0b" />
                      </ComposedChart>
                    </ResponsiveContainer>
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

export default VolatilityCone;