import React from 'react';
import { ArrowRight, BarChart3, BrainCircuit, ChartNoAxesCombined, Lock, Radar, RefreshCw, Scale, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketDataProvenance } from '@/components/MarketDataProvenance';
import PremiumPaywall from '@/components/PremiumPaywall';
import { useAuth } from '@/contexts/AuthContext';
import { useRegime, useSpreadMonitor } from '@/hooks/useProAnalytics';
import { useRollScanner } from '@/hooks/useMassiveAnalytics';

const ProAnalyticsWorkspace = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.tier === 'pro';
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const regimes = useRegime(isPro);
  const spreads = useSpreadMonitor(isPro);
  const rolls = useRollScanner(isPro);

  const topRegimes = regimes.data?.rows.filter((row) => !row.error).slice(0, 3) ?? [];
  const topSpreads = spreads.data?.rows.filter((row) => !row.error).slice(0, 3) ?? [];
  const topRolls = rolls.data?.results.filter((row) => !row.error).slice(0, 3) ?? [];
  const isLoading = regimes.isLoading || spreads.isLoading || rolls.isLoading;
  const asOf = [regimes.data?.generatedAt, spreads.data?.generatedAt, rolls.data?.asOf, rolls.data?.generatedAt].find(Boolean);
  const stale = Boolean(rolls.data?.stale);

  const openTool = (path: string) => isPro ? navigate(path) : setPaywallOpen(true);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Commodity Hub Pro</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div><h1 className="font-display text-2xl font-semibold">Analytics Workspace</h1><p className="text-xs text-muted-foreground">Futures context, dislocations, and portfolio research.</p></div>
            <Button size="sm" variant="outline" onClick={() => void Promise.all([regimes.refetch(), spreads.refetch(), rolls.refetch()])} disabled={!isPro || isLoading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />Refresh</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-4">
        <Card className="border-primary/30 bg-primary/5"><CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-lg bg-primary/10 p-2 text-primary"><Sparkles className="h-5 w-5" /></div><div><p className="font-semibold">Today’s commodity decision board</p><p className="text-sm text-muted-foreground">Start with verified market structure, then open the research behind each signal.</p></div></div>{!isPro && <Button onClick={() => setPaywallOpen(true)}><Lock className="mr-1.5 h-4 w-4" />Unlock Pro Analytics</Button>}</CardContent></Card>

        <MarketDataProvenance provenance={{ status: stale ? 'stale' : isPro ? 'eod' : 'reference', source: rolls.data?.provider ?? 'Commodity Hub analytics sources', asOf: asOf ?? null, refreshLabel: 'Analytics refresh on source schedule' }} />

        <section className="grid gap-4 md:grid-cols-3">
          <SignalCard icon={Radar} title="Market regimes" description="Trend and volatility across key commodity futures." onOpen={() => openTool('/regime-scanner')}>
            {topRegimes.map((row) => <Metric key={row.commodity} label={row.label} value={`${row.trend} · ${row.vol} vol`} />)}
          </SignalCard>
          <SignalCard icon={Scale} title="Spread dislocations" description="Current spreads against their historical context." onOpen={() => openTool('/spread-monitor')}>
            {topSpreads.map((row) => <Metric key={row.id} label={row.label} value={row.zScore == null ? 'No z-score' : `${row.zScore >= 0 ? '+' : ''}${row.zScore.toFixed(1)}σ`} />)}
          </SignalCard>
          <SignalCard icon={ChartNoAxesCombined} title="Curve carry" description="Front-to-next-month futures structure." onOpen={() => openTool('/roll-scanner')}>
            {topRolls.map((row) => <Metric key={row.id} label={row.label} value={row.annualizedRoll == null ? 'Unavailable' : `${row.annualizedRoll >= 0 ? '+' : ''}${row.annualizedRoll.toFixed(1)}%`} />)}
          </SignalCard>
        </section>

        <section><div className="mb-2"><h2 className="font-semibold">Research workbench</h2><p className="text-xs text-muted-foreground">Open the analysis that supports the signal—not a broker or execution screen.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ToolCard icon={BarChart3} title="Forward curves" detail="Term structure, carry, and contract strips." path="/forward-curves" onOpen={openTool} />
          <ToolCard icon={BrainCircuit} title="Positioning & fundamentals" detail="COT, storage, crop, weather, and rig data." path="/cot" onOpen={openTool} />
          <ToolCard icon={Sparkles} title="Daily Brief" detail="Source-backed market context and research highlights." path="/daily-brief" onOpen={openTool} />
          <ToolCard icon={Scale} title="Portfolio analytics" detail="Manual-position exposure, risk, and drawdown." path="/portfolio-analytics" onOpen={openTool} />
          <ToolCard icon={ChartNoAxesCombined} title="Term structure" detail="Current curve versus one week and one month ago." path="/term-structure" onOpen={openTool} />
          <ToolCard icon={Radar} title="Seasonality & backtests" detail="Historical tendencies and research scenarios." path="/seasonality" onOpen={openTool} />
        </div></section>
      </main>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs"><span className="truncate text-muted-foreground">{label}</span><span className="whitespace-nowrap font-mono font-medium">{value}</span></div>;
const SignalCard = ({ icon: Icon, title, description, onOpen, children }: { icon: React.ElementType; title: string; description: string; onOpen: () => void; children: React.ReactNode }) => <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="space-y-2">{children || <p className="text-xs text-muted-foreground">Open this panel to load verified analytics.</p>}<Button variant="ghost" size="sm" className="mt-1 w-full justify-between" onClick={onOpen}>Open analysis <ArrowRight className="h-3.5 w-3.5" /></Button></CardContent></Card>;
const ToolCard = ({ icon: Icon, title, detail, path, onOpen }: { icon: React.ElementType; title: string; detail: string; path: string; onOpen: (path: string) => void }) => <button type="button" onClick={() => onOpen(path)} className="rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"><Icon className="h-4 w-4 text-primary" /><p className="mt-2 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></button>;

export default ProAnalyticsWorkspace;
