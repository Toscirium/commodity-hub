import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FlaskConical, Lock, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useBacktest, PRO_ANALYTICS_PRODUCTS } from '@/hooks/useProAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const Backtest: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [commodity, setCommodity] = useState('natgas');
  const [selected, setSelected] = useState<number[]>([11, 12, 1]);
  const [years, setYears] = useState(15);
  const [runParams, setRunParams] = useState<{ commodity: string; monthsLong: number[]; years: number } | null>(null);

  const { data, isLoading, error } = useBacktest(isPro ? runParams : null);

  const toggleMonth = (m: number) => {
    setSelected((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m].sort((a, b) => a - b));
  };

  const run = () => {
    if (!selected.length) return;
    setRunParams({ commodity, monthsLong: selected, years });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-primary" />
            Backtest Sandbox
            <Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Replay seasonal rules against 15+ years of front-month history. Compare to buy-and-hold, see drawdowns and Sharpe.
          </p>
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Backtest Sandbox is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Test "long natgas Nov–Jan" or "long grains May–Jul" and know the historical edge before you put on risk.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-4">
              <CardHeader className="pb-2"><CardDescription>Rule: long the front month during selected calendar months, flat otherwise</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="w-52">
                    <Select value={commodity} onValueChange={setCommodity}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRO_ANALYTICS_PRODUCTS.map((p) => (<SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-40">
                    <Select value={String(years)} onValueChange={(v) => setYears(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[5, 10, 15, 20].map((y) => (<SelectItem key={y} value={String(y)}>{y} years</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={run} disabled={!selected.length || isLoading}>
                    <Play className="w-4 h-4 mr-2" /> {isLoading ? 'Running…' : 'Run backtest'}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MONTHS.map((label, i) => {
                    const m = i + 1;
                    const on = selected.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleMonth(m)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:border-primary/40'}`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Selected: {selected.length ? selected.map((m) => MONTHS[m - 1]).join(', ') : 'none'}
                </p>
              </CardContent>
            </Card>

            {error && (
              <Card className="border-destructive/30 bg-destructive/5"><CardContent className="pt-6 text-sm text-destructive">Backtest failed. Try a different commodity or window.</CardContent></Card>
            )}

            {data && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <Card><CardHeader className="pb-2"><CardDescription>Total return</CardDescription></CardHeader><CardContent>
                    <div className={`text-2xl font-bold ${data.totalReturnPct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{data.totalReturnPct > 0 ? '+' : ''}{data.totalReturnPct.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground mt-1">Over {data.yearsCovered}y</p>
                  </CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardDescription>CAGR</CardDescription></CardHeader><CardContent>
                    <div className="text-2xl font-bold">{data.cagrPct.toFixed(2)}%</div>
                    <p className="text-xs text-muted-foreground mt-1">B&H: {data.buyHoldReturnPct.toFixed(1)}%</p>
                  </CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardDescription>Max drawdown</CardDescription></CardHeader><CardContent>
                    <div className={`text-2xl font-bold ${data.maxDrawdownPct < -20 ? 'text-red-400' : 'text-yellow-400'}`}>{data.maxDrawdownPct.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground mt-1">Peak-to-trough</p>
                  </CardContent></Card>
                  <Card><CardHeader className="pb-2"><CardDescription>Hit rate</CardDescription></CardHeader><CardContent>
                    <div className="text-2xl font-bold">{Math.round(data.hitRate * 100)}%</div>
                    <p className="text-xs text-muted-foreground mt-1">{data.trades} trades · Sharpe {data.sharpe ?? '—'}</p>
                  </CardContent></Card>
                </div>
                <Card>
                  <CardHeader><CardDescription>Equity curve (starting at 1.0)</CardDescription></CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.equityCurve}>
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={60} />
                          <YAxis tick={{ fontSize: 10 }} domain={['dataMin', 'dataMax']} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
                          <Line type="monotone" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
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

export default Backtest;