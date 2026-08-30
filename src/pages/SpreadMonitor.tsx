import React, { useState } from 'react';
import PageShell from '@/components/PageShell';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, GitCompareArrows, Lock, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { useSpreadMonitor } from '@/hooks/useProAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';
import { downloadCsv } from '@/utils/csvExport';

const tagStyle = (tag?: string) => {
  if (tag === 'rich') return 'bg-red-500/15 text-red-400 border-red-500/30';
  if (tag === 'cheap') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  return 'bg-muted text-muted-foreground border-border';
};

const SpreadMonitor: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useSpreadMonitor(isPro);

  const handleExport = () => {
    if (!data) return;
    downloadCsv(
      `spread-monitor-${new Date().toISOString().slice(0, 10)}`,
      ['Spread', 'Unit', 'Current', '20d Avg', '1y Mean', '1y Std', 'Z-score', 'Tag', 'As Of'],
      data.rows.map((r) => [
        r.label,
        r.unit ?? '',
        r.current ?? '',
        r.avg20 ?? '',
        r.mean1y ?? '',
        r.std1y ?? '',
        r.zScore ?? '',
        r.tag ?? '',
        r.asOf ?? '',
      ]),
    );
  };

  return (
    <PageShell
      eyebrow="SPRDMON"
      title="Inter-Commodity Spread Monitor"
      width="6xl"
      description="Live crack, crush and ratio spreads with 1-year z-score and 60-day sparklines. Rich/cheap flagged at |z| ≥ 1.5."
      badges={<Badge className="bg-primary/15 text-primary border-transparent">Pro</Badge>}
      actions={isPro && (
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!data}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </>
      )}
    >

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Spread Monitor is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Crack 3-2-1, soybean crush, gold/silver ratio, WTI–Brent — the spreads traders and physical desks actually watch. Z-scored to spot dislocations.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isLoading && <p className="text-sm text-muted-foreground">Loading spread history…</p>}
            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">
                  Couldn't load spreads. Try refreshing in a moment.
                </CardContent>
              </Card>
            )}

            {data && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.rows.map((row) => (
                  <Card key={row.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardDescription className="text-sm font-medium text-foreground">{row.label}</CardDescription>
                        {row.tag && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-semibold ${tagStyle(row.tag)}`}>
                            {row.tag}
                          </span>
                        )}
                      </div>
                      {row.unit && <p className="text-[11px] text-muted-foreground">{row.unit}</p>}
                    </CardHeader>
                    <CardContent>
                      {row.error ? (
                        <p className="text-xs text-muted-foreground">Data unavailable</p>
                      ) : (
                        <>
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <div className="text-2xl font-bold">
                                {row.current?.toFixed(row.unit === 'ratio' ? 2 : 2)}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                20d avg {row.avg20?.toFixed(2)} · 1y μ {row.mean1y?.toFixed(2)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`text-lg font-bold ${(row.zScore ?? 0) > 1.5 ? 'text-red-400' : (row.zScore ?? 0) < -1.5 ? 'text-emerald-400' : ''}`}>
                                z {row.zScore?.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">1y σ {row.std1y?.toFixed(2)}</div>
                            </div>
                          </div>
                          <div className="h-12 mt-3">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={(row.spark ?? []).map((v, i) => ({ i, v }))}>
                                <YAxis hide domain={['dataMin', 'dataMax']} />
                                <Line
                                  type="monotone"
                                  dataKey="v"
                                  stroke="hsl(var(--primary))"
                                  strokeWidth={1.5}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          {row.note && <p className="text-[10px] text-muted-foreground mt-2">{row.note}</p>}
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

export default SpreadMonitor;