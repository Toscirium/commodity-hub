import React from 'react';
import {
  Activity, ArrowRight, Bell, BrainCircuit, CandlestickChart, ChartNoAxesCombined,
  ChevronRight, Clock3, Layers, Layers3, Lock, Radar, RefreshCw, Scale, Sparkles, TrendingDown, TrendingUp,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { commodityDetailPath } from '@/lib/commoditySlug';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MarketDataProvenance } from '@/components/MarketDataProvenance';
import PremiumPaywall from '@/components/PremiumPaywall';
import { useAuth } from '@/contexts/AuthContext';
import { useAvailableCommodities, type Commodity } from '@/hooks/useCommodityData';
import { useRegime, useSpreadMonitor } from '@/hooks/useProAnalytics';
import { useRollScanner } from '@/hooks/useMassiveAnalytics';
import { formatPrice } from '@/lib/commodityUtils';

const FOCUS_SYMBOLS = ['WTI Crude Oil', 'Natural Gas', 'Gold Futures', 'Copper', 'Corn Futures', 'Coffee Arabica'];

const ProAnalyticsWorkspace = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPro = auth?.tier === 'pro';
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const { data: commodities = [], isLoading: pricesLoading, refetch: refetchPrices } = useAvailableCommodities({ lightweight: true });
  const regimes = useRegime(isPro);
  const spreads = useSpreadMonitor(isPro);
  const rolls = useRollScanner(isPro);

  const focusMarkets = React.useMemo(
    () => FOCUS_SYMBOLS.map((name) => commodities.find((commodity) => commodity.name === name)).filter((commodity): commodity is Commodity => Boolean(commodity)),
    [commodities],
  );
  const movers = React.useMemo(
    () => [...commodities].filter((commodity) => Number.isFinite(commodity.changePercent)).sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 5),
    [commodities],
  );
  const topRegimes = regimes.data?.rows.filter((row) => !row.error).slice(0, 5) ?? [];
  const topSpreads = spreads.data?.rows.filter((row) => !row.error).slice(0, 4) ?? [];
  const topRolls = rolls.data?.results.filter((row) => !row.error).slice(0, 4) ?? [];
  const isLoading = pricesLoading || regimes.isLoading || spreads.isLoading || rolls.isLoading;
  const asOf = [regimes.data?.generatedAt, spreads.data?.generatedAt, rolls.data?.asOf, rolls.data?.generatedAt].find(Boolean);
  const stale = Boolean(rolls.data?.stale);

  const openTool = (path: string) => isPro ? navigate(path) : setPaywallOpen(true);
  const refresh = () => void Promise.all([refetchPrices(), regimes.refetch(), spreads.refetch(), rolls.refetch()]);

  return (
    <div className="min-h-screen bg-background pb-12 font-sans">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary"><CandlestickChart className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><p className="font-mono text-xs font-semibold tracking-[0.14em] text-primary">COMMODITY HUB PRO</p><span className="hidden text-xs text-muted-foreground sm:inline">/</span><span className="hidden text-xs text-muted-foreground sm:inline">MARKETS WORKSPACE</span></div>
            <h1 className="truncate font-display text-lg font-semibold tracking-tight sm:text-xl">Global commodity monitor</h1>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex"><span className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-emerald-500'}`} />{stale ? 'Delayed analytics' : 'Market data connected'}</div>
          <Button size="sm" variant="outline" onClick={refresh} disabled={isLoading} className="shrink-0"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />Refresh</Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4 sm:px-6">
        {!isPro && <Card className="border-primary/35 bg-primary/5"><CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-md bg-primary/10 p-2 text-primary"><Lock className="h-4 w-4" /></div><div><p className="text-sm font-semibold">Professional Markets Workspace</p><p className="text-xs text-muted-foreground">Preview live market context. Unlock analytical signals, curves, and research tools with Pro.</p></div></div><Button size="sm" onClick={() => setPaywallOpen(true)}>Unlock Pro</Button></CardContent></Card>}

        <MarketDataProvenance provenance={{ status: stale ? 'stale' : isPro ? 'eod' : 'reference', source: rolls.data?.provider ?? 'Commodity Hub market data', asOf: asOf ?? null, refreshLabel: 'Prices and analytics refresh on their source schedules' }} />

        <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
          <WorkspacePanel title="Focus list" subtitle="Cross-asset front-month monitor" icon={Activity} action="Open watchlists" onAction={() => navigate('/watchlists')} className="xl:row-span-2">
            <div className="divide-y divide-border">
              {focusMarkets.length > 0 ? focusMarkets.map((market) => <QuoteRow key={market.name} market={market} onClick={() => navigate(commodityDetailPath(market.name))} />) : <LoadingRows />}
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Market pulse" subtitle="Largest absolute moves" icon={TrendingUp} action="Open screener" onAction={() => navigate('/screener')}>
            <div className="space-y-1">{movers.length > 0 ? movers.map((market) => <CompactQuote key={market.name} market={market} />) : <LoadingRows rows={5} />}</div>
          </WorkspacePanel>

          <WorkspacePanel title="Research queue" subtitle="Start from a signal, not a blank page" icon={BrainCircuit}>
            <div className="space-y-1.5">
              <Launcher label="Daily commodity brief" detail="News and market context" icon={Sparkles} onClick={() => openTool('/daily-brief')} />
              <Launcher label="AI research copilot" detail="Source-backed market questions" icon={BrainCircuit} onClick={() => openTool('/copilot')} />
              <Launcher label="Economic calendar" detail="Scheduled market catalysts" icon={Clock3} onClick={() => navigate('/calendar')} />
              <Launcher label="Price alerts" detail="Monitor levels and moves" icon={Bell} onClick={() => navigate('/alerts')} />
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Regime map" subtitle="60-day trend and annualized volatility" icon={Radar} action="Open scanner" onAction={() => openTool('/regime-scanner')}>
            <div className="space-y-2">{topRegimes.length > 0 ? topRegimes.map((row) => <div key={row.commodity} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs"><span className="truncate font-medium">{row.label}</span><RegimeBadge trend={row.trend} /><span className="font-mono text-muted-foreground">{row.volAnnualized == null ? '—' : `${row.volAnnualized.toFixed(0)}% vol`}</span></div>) : <LockedOrLoading isPro={isPro} />}</div>
          </WorkspacePanel>

          <WorkspacePanel title="Spread dislocations" subtitle="Current spread versus one-year context" icon={Scale} action="Open monitor" onAction={() => openTool('/spread-monitor')}>
            <div className="space-y-2">{topSpreads.length > 0 ? topSpreads.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-xs"><span className="truncate font-medium">{row.label}</span><span className={`font-mono font-semibold ${row.zScore && Math.abs(row.zScore) >= 1 ? 'text-primary' : 'text-muted-foreground'}`}>{row.zScore == null ? '—' : `${row.zScore >= 0 ? '+' : ''}${row.zScore.toFixed(1)}σ`}</span></div>) : <LockedOrLoading isPro={isPro} />}</div>
          </WorkspacePanel>

          <WorkspacePanel title="Curve carry" subtitle="Annualized front-to-next roll signal" icon={Layers3} action="Open scanner" onAction={() => openTool('/roll-scanner')}>
            <div className="space-y-2">{topRolls.length > 0 ? topRolls.map((row) => <div key={row.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-xs"><span className="truncate font-medium">{row.label}</span><span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{row.structure ?? '—'}</span><span className="font-mono text-muted-foreground">{row.annualizedRoll == null ? '—' : `${row.annualizedRoll >= 0 ? '+' : ''}${row.annualizedRoll.toFixed(1)}%`}</span></div>) : <LockedOrLoading isPro={isPro} />}</div>
          </WorkspacePanel>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ToolTile title="Forward curves" detail="Term structure and carry" icon={ChartNoAxesCombined} onClick={() => openTool('/forward-curves')} />
          <ToolTile title="Positioning" detail="COT commitment reports" icon={Scale} onClick={() => openTool('/cot')} />
          <ToolTile title="Seasonality" detail="Historical calendar patterns" icon={Clock3} onClick={() => openTool('/seasonality')} />
          <ToolTile title="Portfolio risk" detail="Exposure and drawdown" icon={Activity} onClick={() => openTool('/portfolio-analytics')} />
          <ToolTile title="Options chain" detail="Settlements, OI, and IV by strike" icon={Layers} onClick={() => openTool('/options-chain')} />
        </section>
      </main>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
};

const WorkspacePanel = ({ title, subtitle, icon: Icon, action, onAction, children, className = '' }: { title: string; subtitle: string; icon: React.ElementType; action?: string; onAction?: () => void; children: React.ReactNode; className?: string }) => <Card className={`overflow-hidden ${className}`}><div className="flex items-start justify-between border-b border-border bg-muted/20 px-4 py-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-[11px] text-muted-foreground">{subtitle}</p></div></div>{action && <button type="button" onClick={onAction} className="text-xs text-primary hover:underline">{action}</button>}</div><CardContent className="p-3">{children}</CardContent></Card>;
const QuoteRow = ({ market, onClick }: { market: Commodity; onClick: () => void }) => <button type="button" onClick={onClick} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/50"><div className="min-w-0"><p className="truncate text-sm font-medium">{market.name}</p><p className="truncate font-mono text-[11px] text-muted-foreground">{market.symbol} · {market.venue}</p></div><span className="font-mono text-sm">{formatPrice(market.price, market.name)}</span><Change value={market.changePercent} /></button>;
const CompactQuote = ({ market }: { market: Commodity }) => <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-1 py-1.5 text-xs"><span className="truncate font-medium">{market.name}</span><span className="font-mono text-muted-foreground">{formatPrice(market.price, market.name)}</span><Change value={market.changePercent} /></div>;
const Change = ({ value }: { value: number }) => <span className={`flex min-w-[58px] items-center justify-end gap-0.5 font-mono text-xs font-medium ${value >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{value >= 0 ? '+' : ''}{value.toFixed(2)}%</span>;
const RegimeBadge = ({ trend }: { trend: 'up' | 'down' | 'sideways' }) => <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${trend === 'up' ? 'bg-emerald-500/10 text-emerald-600' : trend === 'down' ? 'bg-red-500/10 text-red-600' : 'bg-muted text-muted-foreground'}`}>{trend}</span>;
const Launcher = ({ label, detail, icon: Icon, onClick }: { label: string; detail: string; icon: React.ElementType; onClick: () => void }) => <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md border border-transparent p-2 text-left hover:border-border hover:bg-muted/50"><Icon className="h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{label}</span><span className="block truncate text-[11px] text-muted-foreground">{detail}</span></span><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></button>;
const ToolTile = ({ title, detail, icon: Icon, onClick }: { title: string; detail: string; icon: React.ElementType; onClick: () => void }) => <button type="button" onClick={onClick} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/45 hover:bg-muted/40"><span className="rounded-md bg-primary/10 p-2 text-primary"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="block truncate text-xs text-muted-foreground">{detail}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></button>;
const LoadingRows = ({ rows = 6 }: { rows?: number }) => <div className="space-y-2">{Array.from({ length: rows }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded bg-muted" />)}</div>;
const LockedOrLoading = ({ isPro }: { isPro: boolean }) => <p className="py-3 text-center text-xs text-muted-foreground">{isPro ? 'Loading verified analytics…' : 'Unlock Pro to load this analytical signal.'}</p>;

export default ProAnalyticsWorkspace;
