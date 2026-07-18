import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PieChart as PieIcon, Lock, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolioAnalytics } from '@/hooks/useProAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';

const Stat: React.FC<{ label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' | 'neutral' }> = ({ label, value, sub, tone = 'neutral' }) => (
  <Card>
    <CardHeader className="pb-2"><CardDescription>{label}</CardDescription></CardHeader>
    <CardContent>
      <div className={`text-2xl font-bold ${tone === 'good' ? 'text-emerald-400' : tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-yellow-400' : ''}`}>{value}</div>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </CardContent>
  </Card>
);

const PortfolioAnalytics: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = usePortfolioAnalytics(isPro);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PieIcon className="w-6 h-6 text-primary" />
              Portfolio Analytics
              <Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Value-at-Risk, max drawdown, volatility and crude-beta computed against ~1y of front-month history.
            </p>
          </div>
          {isPro && (
            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => navigate('/stress-test')}>Stress test</Button><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh</Button></div>
          )}
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Portfolio Analytics is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Know your daily VaR, your worst drawdown, and your crude sensitivity — the metrics real desks live by.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Reconstructing your portfolio history…</p>
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">Couldn't compute analytics. Try again in a moment.</CardContent>
          </Card>
        ) : data?.error ? (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <p className="font-medium">
                  {data.error === 'no_positions' ? 'No positions yet' :
                   data.error === 'no_price_history' ? 'No price history available for your holdings' :
                   data.error === 'insufficient_history' ? 'Not enough history yet (need ~20 trading days)' :
                   'Analytics unavailable'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add positions in your portfolio to see risk metrics. Analytics only cover commodities we have front-month history for.
                </p>
                <Button size="sm" className="mt-3" onClick={() => navigate('/portfolio')}>Open portfolio</Button>
              </div>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat label="Current value" value={`$${data.currentValue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${data.positions} position${data.positions === 1 ? '' : 's'}`} />
              <Stat label="Daily VaR 95%" tone="bad" value={`$${data.var95Daily?.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} sub={`${data.var95Pct?.toFixed(2)}% of value`} />
              <Stat label="Max drawdown" tone={data.maxDrawdownPct != null && data.maxDrawdownPct < -15 ? 'bad' : 'warn'} value={`${data.maxDrawdownPct?.toFixed(2)}%`} sub="Over lookback" />
              <Stat label="Vol (annualized)" value={`${data.volAnnualizedPct?.toFixed(1)}%`} sub={`Sharpe ${data.sharpe ?? '—'}`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
              <Stat label="Crude beta" value={data.beta != null ? data.beta.toFixed(2) : '—'} sub="vs WTI front-month" tone={data.beta != null && Math.abs(data.beta) > 1.2 ? 'warn' : 'neutral'} />
              <Stat label="Sharpe (est)" value={data.sharpe != null ? data.sharpe.toFixed(2) : '—'} sub="Daily returns × √252" />
              <Stat label="Data days" value={String(data.history?.length ?? 0)} sub="Latest 90 shown below" />
            </div>
            <Card>
              <CardHeader><CardDescription>Portfolio value — last 90 sessions</CardDescription></CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.history ?? []}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
                      <YAxis tick={{ fontSize: 10 }} domain={['dataMin', 'dataMax']} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                      <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Mark-to-market using front-month closes. Positions marked as <em>short</em> contribute inversely.
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default PortfolioAnalytics;
