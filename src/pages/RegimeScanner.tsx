import React, { useState } from 'react';
import PageShell from '@/components/PageShell';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Radar, Lock, RefreshCw, Download, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useRegime, type RegimeRow } from '@/hooks/useProAnalytics';
import { downloadCsv } from '@/utils/csvExport';
import PremiumPaywall from '@/components/PremiumPaywall';

const TrendIcon: React.FC<{ t: RegimeRow['trend'] }> = ({ t }) =>
  t === 'up' ? <TrendingUp className="w-4 h-4 text-emerald-400" /> :
  t === 'down' ? <TrendingDown className="w-4 h-4 text-red-400" /> :
  <Minus className="w-4 h-4 text-muted-foreground" />;

const volColor = (v: RegimeRow['vol']) =>
  v === 'high' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
  v === 'low' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
  'bg-muted text-muted-foreground border-border';

const trendColor = (t: RegimeRow['trend']) =>
  t === 'up' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' :
  t === 'down' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
  'bg-muted text-muted-foreground border-border';

const RegimeScanner: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const [paywallOpen, setPaywallOpen] = useState(false);
  const { data, isLoading, error, refetch, isFetching } = useRegime(isPro);

  const handleExport = () => {
    if (!data) return;
    downloadCsv(
      `regime-scanner-${new Date().toISOString().slice(0, 10)}`,
      ['Commodity', 'Price', 'Trend', 'Vol Regime', 'Vol (ann %)', '20d Return %', '60d Return %'],
      data.rows.map((r) => [r.label, r.price ?? '', r.trend, r.vol, r.volAnnualized ?? '', r.return20d ?? '', r.return60d ?? '']),
    );
  };

  return (
    <PageShell
      eyebrow="REGIME"
      title="Regime Scanner"
      width="6xl"
      description="Trend (SMA stack + slope) and volatility regime (20d vs 1y percentile) for every tracked commodity. Spot rotations before they show up in price."
      badges={<Badge className="bg-primary/15 text-primary border-transparent">Pro</Badge>}
      actions={isPro && data && (
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
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
                <p className="font-medium">Regime Scanner is a Pro feature</p>
                <p className="text-sm text-muted-foreground mt-1">
                  See at a glance which commodities are in a trending vs sideways regime and whether volatility is compressed or expanding.
                </p>
              </div>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to Pro</Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Computing regime for every commodity…</p>
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="pt-6 text-sm text-destructive">Couldn't load regime data. Try again in a moment.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data?.rows.map((r) => (
              <Card key={r.commodity} className={r.error ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardDescription className="text-sm font-medium text-foreground">{r.label}</CardDescription>
                    {r.price != null && <span className="text-xs font-mono">${r.price.toFixed(2)}</span>}
                  </div>
                </CardHeader>
                <CardContent className="pt-1">
                  {r.error ? (
                    <p className="text-xs text-muted-foreground">Data unavailable</p>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-semibold flex items-center gap-1 ${trendColor(r.trend)}`}>
                          <TrendIcon t={r.trend} /> {r.trend}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-semibold ${volColor(r.vol)}`}>
                          vol {r.vol}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground text-[10px]">20d</div>
                          <div className={`font-semibold ${(r.return20d ?? 0) > 0 ? 'text-emerald-400' : (r.return20d ?? 0) < 0 ? 'text-red-400' : ''}`}>
                            {(r.return20d ?? 0) > 0 ? '+' : ''}{r.return20d?.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[10px]">60d</div>
                          <div className={`font-semibold ${(r.return60d ?? 0) > 0 ? 'text-emerald-400' : (r.return60d ?? 0) < 0 ? 'text-red-400' : ''}`}>
                            {(r.return60d ?? 0) > 0 ? '+' : ''}{r.return60d?.toFixed(1)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground text-[10px]">Vol ann</div>
                          <div className="font-semibold">{r.volAnnualized?.toFixed(0)}%</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

export default RegimeScanner;