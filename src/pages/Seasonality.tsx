import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarRange, Download, Lock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PageShell from '@/components/PageShell';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useSeasonality, PRO_ANALYTICS_PRODUCTS } from '@/hooks/useProAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';
import { downloadCsv } from '@/utils/csvExport';

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const cellColor = (v: number, maxAbs: number) => {
  const alpha = Math.min(0.85, Math.abs(v) / (maxAbs || 1));
  if (v > 0) return `hsl(142 70% 45% / ${alpha})`;
  if (v < 0) return `hsl(0 72% 55% / ${alpha})`;
  return 'hsl(var(--muted) / 0.4)';
};

const Seasonality: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [commodity, setCommodity] = useState('wti');
  const { data, isLoading, error, refetch, isFetching } = useSeasonality(isPro ? commodity : null);

  const currentMonth = new Date().getMonth() + 1;
  const maxAbs = data ? Math.max(...data.months.map((m) => Math.abs(m.avgReturn)), 0.01) : 1;
  const currentStat = data?.months.find((m) => m.month === currentMonth);

  const handleExport = () => {
    if (!data) return;
    downloadCsv(
      `seasonality-${data.commodity}-${new Date().toISOString().slice(0, 10)}`,
      ['Month', 'Avg Return %', 'Hit Rate %', 'Years', 'Min %', 'Max %'],
      data.months.map((m) => [
        MONTH_LABELS[m.month - 1],
        m.avgReturn,
        Math.round(m.hitRate * 100),
        m.years,
        m.min,
        m.max,
      ]),
    );
  };

  return (
    <PageShell
      eyebrow="SEASON"
      title="Seasonality Heatmap"
      description="Average monthly return and hit rate across up to 20 years of settled front-month data."
      badges={<Badge className="bg-primary/15 text-primary border-transparent">Pro</Badge>}
    >

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Seasonality Heatmap is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  See which months historically pay in commodities — natgas winter demand, gasoline summer driving, grains harvest — with 20 years of hit rates and average returns.
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
                    {PRO_ANALYTICS_PRODUCTS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={!data}>
                <Download className="w-4 h-4 mr-2" /> CSV
              </Button>
            </div>

            {isLoading && <p className="text-sm text-muted-foreground">Computing 20 years of monthly returns…</p>}
            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">
                  Couldn't load seasonality history. Try again in a moment.
                </CardContent>
              </Card>
            )}

            {data && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Current Month · {MONTH_LABELS[currentMonth - 1]}</CardDescription></CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${currentStat && currentStat.avgReturn > 0 ? 'text-emerald-400' : currentStat && currentStat.avgReturn < 0 ? 'text-red-400' : ''}`}>
                        {currentStat ? `${currentStat.avgReturn > 0 ? '+' : ''}${currentStat.avgReturn.toFixed(2)}%` : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Avg over {currentStat?.years ?? 0} years
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Hit Rate · {MONTH_LABELS[currentMonth - 1]}</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {currentStat ? `${Math.round(currentStat.hitRate * 100)}%` : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Positive months / total</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardDescription>Coverage</CardDescription></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{data.yearsCovered}y</div>
                      <p className="text-xs text-muted-foreground mt-1">Settled front-month history</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardDescription>{data.label} — Average monthly return heatmap</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-2">
                      {data.months.map((m) => (
                        <div
                          key={m.month}
                          className={`rounded-md p-2 text-center border ${m.month === currentMonth ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                          style={{ background: cellColor(m.avgReturn, maxAbs) }}
                          title={`${MONTH_LABELS[m.month - 1]}: avg ${m.avgReturn.toFixed(2)}%, hit ${Math.round(m.hitRate * 100)}%, ${m.years}y`}
                        >
                          <div className="text-[10px] font-medium opacity-90">{MONTH_LABELS[m.month - 1]}</div>
                          <div className="text-xs font-bold mt-0.5">{m.avgReturn > 0 ? '+' : ''}{m.avgReturn.toFixed(1)}%</div>
                          <div className="text-[9px] opacity-75">{Math.round(m.hitRate * 100)}%</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3">
                      Green = positive avg return, red = negative. Bottom % = hit rate (share of years positive). Hover for details.
                    </p>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

export default Seasonality;