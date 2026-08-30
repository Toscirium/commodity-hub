import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PieChart as PieIcon, Lock, RefreshCw, AlertTriangle, ShieldAlert, ShieldCheck, Layers3 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { usePortfolioAnalytics } from '@/hooks/useProAnalytics';
import { usePortfolio } from '@/hooks/usePortfolio';
import PremiumPaywall from '@/components/PremiumPaywall';
import PageShell from '@/components/PageShell';

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
  const { positions, loading: positionsLoading } = usePortfolio();
  const exposure = React.useMemo(() => {
    const gross = positions.reduce((sum, position) => sum + Math.abs(position.current_value), 0);
    const rows = positions
      .map((position) => ({
        name: position.commodity_name,
        value: position.current_value,
        weight: gross > 0 ? Math.abs(position.current_value) / gross : 0,
      }))
      .sort((a, b) => b.weight - a.weight);
    const concentrationHhi = rows.reduce((sum, row) => sum + row.weight ** 2, 0) * 10_000;
    return { gross, rows: rows.slice(0, 5), largestWeight: rows[0]?.weight ?? 0, concentrationHhi };
  }, [positions]);

  return (
    <PageShell
      eyebrow="PORT"
      title="Portfolio Analytics"
      description="Value-at-Risk, max drawdown, volatility and crude-beta computed against ~1y of front-month history."
      badges={<Badge className="bg-primary/15 text-primary border-transparent">Pro</Badge>}
      actions={isPro && (
        <>
          <Button variant="outline" size="sm" onClick={() => navigate('/stress-test')}>Stress test</Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </>
      )}
    >

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
            <section className="grid grid-cols-1 gap-3 mb-6 lg:grid-cols-[1.25fr_1fr]">
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-primary" />Gross exposure and concentration</CardDescription></CardHeader>
                <CardContent>
                  {positionsLoading ? <p className="text-sm text-muted-foreground">Loading position exposures…</p> : exposure.rows.length === 0 ? <p className="text-sm text-muted-foreground">Add positions to see exposure concentration.</p> : <>
                    <div className="mb-4 grid grid-cols-2 gap-3 text-sm"><RiskReadout label="Gross exposure" value={`$${exposure.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} /><RiskReadout label="Concentration" value={`${exposure.concentrationHhi.toFixed(0)} HHI`} detail="10,000 = single holding" /></div>
                    <div className="space-y-3">{exposure.rows.map((position) => <div key={position.name}><div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="truncate font-medium">{position.name}</span><span className="font-mono text-muted-foreground">{(position.weight * 100).toFixed(1)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(position.weight * 100, 2)}%` }} /></div></div>)}</div>
                  </>}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-primary" />Risk guardrails</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  <Guardrail label="Daily VaR" value={data.var95Pct == null ? '—' : `${data.var95Pct.toFixed(2)}%`} state={data.var95Pct != null && data.var95Pct > 3 ? 'warn' : 'ok'} detail="95% one-day estimate" />
                  <Guardrail label="Largest holding" value={`${(exposure.largestWeight * 100).toFixed(1)}%`} state={exposure.largestWeight > 0.4 ? 'warn' : 'ok'} detail="of gross exposure" />
                  <Guardrail label="Crude beta" value={data.beta == null ? '—' : data.beta.toFixed(2)} state={data.beta != null && Math.abs(data.beta) > 1.2 ? 'warn' : 'ok'} detail="sensitivity to WTI" />
                  <Guardrail label="Max drawdown" value={data.maxDrawdownPct == null ? '—' : `${data.maxDrawdownPct.toFixed(2)}%`} state={data.maxDrawdownPct != null && data.maxDrawdownPct < -15 ? 'warn' : 'ok'} detail="historical lookback" />
                </CardContent>
              </Card>
            </section>
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
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

const RiskReadout = ({ label, value, detail }: { label: string; value: string; detail?: string }) => <div><p className="text-xs text-muted-foreground">{label}</p><p className="font-mono text-base font-semibold">{value}</p>{detail && <p className="text-[10px] text-muted-foreground">{detail}</p>}</div>;
const Guardrail = ({ label, value, detail, state }: { label: string; value: string; detail: string; state: 'ok' | 'warn' }) => <div className="flex items-center gap-2 border-b border-border pb-2 last:border-0 last:pb-0"><span className={state === 'warn' ? 'text-amber-500' : 'text-emerald-500'}>{state === 'warn' ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-xs font-medium">{label}</p><p className="text-[10px] text-muted-foreground">{detail}</p></div><span className="font-mono text-sm font-semibold">{value}</span></div>;

export default PortfolioAnalytics;
