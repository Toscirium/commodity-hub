import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Lock, RefreshCw, ArrowUpDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useRollScanner, type RollScannerRow } from '@/hooks/useMassiveAnalytics';
import PremiumPaywall from '@/components/PremiumPaywall';

type SortKey = 'annualizedRoll' | 'rollM1M2' | 'fullSlope' | 'label';

const RollScanner: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('annualizedRoll');
  const [sortDesc, setSortDesc] = useState(true);
  const { data, isLoading, error, refetch, isFetching } = useRollScanner(isPro);

  const rows = useMemo<RollScannerRow[]>(() => {
    const list = [...(data?.results ?? [])];
    list.sort((a, b) => {
      const av = a[sortKey] as number | string | undefined;
      const bv = b[sortKey] as number | string | undefined;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDesc ? bv.localeCompare(av) : av.localeCompare(bv);
      }
      return sortDesc ? (bv as number) - (av as number) : (av as number) - (bv as number);
    });
    return list;
  }, [data, sortKey, sortDesc]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDesc((d) => !d);
    else { setSortKey(k); setSortDesc(true); }
  };

  const StructureBadge = ({ s }: { s?: RollScannerRow['structure'] }) => {
    if (s === 'backwardation') return <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-500/30 gap-1"><TrendingDown className="w-3 h-3" />Backwardation</Badge>;
    if (s === 'contango') return <Badge className="bg-orange-600/20 text-orange-400 border-orange-500/30 gap-1"><TrendingUp className="w-3 h-3" />Contango</Badge>;
    if (s === 'flat') return <Badge variant="outline" className="gap-1"><Activity className="w-3 h-3" />Flat</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">No data</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" /> Dashboard
        </Button>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ArrowUpDown className="w-6 h-6 text-primary" />
              Roll Yield Scanner
              <Badge className="ml-1 bg-primary/15 text-primary border-transparent">Pro</Badge>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Live front-month → next-month roll across {data?.results.length ?? 14} futures. Spot contango vs backwardation at a glance.
            </p>
          </div>
          {isPro && (
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          )}
        </div>

        {!isPro ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 flex items-start gap-3">
              <Lock className="w-5 h-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Roll Yield Scanner is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Rank all 14 covered futures by carry — find the steepest backwardation (free yield) and worst contango (drag) instantly.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {isLoading && <p className="text-sm text-muted-foreground">Scanning futures strip…</p>}
            {error && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">
                  Couldn't load the scanner. Try refreshing — the latest session may not be settled yet.
                </CardContent>
              </Card>
            )}
            {data && (
              <Card className="overflow-hidden">
                {data.stale && (
                  <div className="px-3 py-2 text-xs bg-amber-500/10 text-amber-400 border-b border-amber-500/30">
                    Showing last settled session ({data.asOf ? new Date(data.asOf).toLocaleString() : '—'}). Live data unavailable right now.
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium cursor-pointer" onClick={() => toggleSort('label')}>Commodity</th>
                        <th className="px-3 py-2 text-left font-medium">Structure</th>
                        <th className="px-3 py-2 text-right font-medium">M1</th>
                        <th className="px-3 py-2 text-right font-medium">M2</th>
                        <th className="px-3 py-2 text-right font-medium cursor-pointer" onClick={() => toggleSort('rollM1M2')}>M1→M2 %</th>
                        <th className="px-3 py-2 text-right font-medium cursor-pointer" onClick={() => toggleSort('annualizedRoll')}>Annualized %</th>
                        <th className="px-3 py-2 text-right font-medium cursor-pointer" onClick={() => toggleSort('fullSlope')}>Full Slope %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                          <td className="px-3 py-2">
                            <div className="font-medium">{r.label}</div>
                            <div className="text-xs text-muted-foreground">{r.code} · {r.category}</div>
                          </td>
                          <td className="px-3 py-2"><StructureBadge s={r.structure} /></td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.m1 != null ? r.m1.toFixed(2) : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{r.m2 != null ? r.m2.toFixed(2) : '—'}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${r.rollM1M2 == null ? '' : r.rollM1M2 > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                            {r.rollM1M2 != null ? `${r.rollM1M2 > 0 ? '+' : ''}${r.rollM1M2.toFixed(2)}%` : '—'}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.annualizedRoll == null ? '' : r.annualizedRoll > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                            {r.annualizedRoll != null ? `${r.annualizedRoll > 0 ? '+' : ''}${r.annualizedRoll.toFixed(1)}%` : '—'}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${r.fullSlope == null ? '' : r.fullSlope > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                            {r.fullSlope != null ? `${r.fullSlope > 0 ? '+' : ''}${r.fullSlope.toFixed(2)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border bg-muted/20">
                  Generated {new Date(data.generatedAt).toLocaleString()} · {data.provider} · EOD settlements
                </div>
              </Card>
            )}
          </>
        )}
      </div>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

export default RollScanner;