import React, { useMemo } from 'react';
import { Bell, ChevronRight, CircleAlert, Crown, Search, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { commodityDetailPath } from '@/lib/commoditySlug';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import { usePriceAlerts, useUndismissedTriggers } from '@/hooks/usePriceAlerts';
import { useWatchlistItems, useWatchlists } from '@/hooks/useWatchlists';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { formatPrice } from '@/lib/commodityUtils';
import PremiumPaywall from '@/components/PremiumPaywall';

type PinnedInstrument = { name: string; symbol: string };

const Today: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const { data: commodities = [], isLoading, error, dataUpdatedAt } = useAvailableCommodities();
  const { data: watchlists = [] } = useWatchlists();
  const defaultWatchlist = watchlists.find((watchlist) => watchlist.is_default) ?? watchlists[0];
  const { data: watchlistItems = [] } = useWatchlistItems(defaultWatchlist?.id ?? null);
  const { data: alerts = [] } = usePriceAlerts();
  const { data: triggers = [] } = useUndismissedTriggers();
  const [search, setSearch] = React.useState('');
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [pinned, setPinned] = useLocalStorage<PinnedInstrument[]>(`today-pins:${auth?.user?.id ?? 'guest'}`, []);

  const commodityByName = useMemo(() => new Map(commodities.map((commodity) => [commodity.name, commodity])), [commodities]);
  const visible = useMemo(() => {
    const requested = pinned.length ? pinned : watchlistItems.map(({ commodity_name: name, commodity_symbol: symbol }) => ({ name, symbol: symbol ?? '' }));
    return requested.map(({ name }) => commodityByName.get(name)).filter(Boolean).slice(0, 5);
  }, [commodityByName, pinned, watchlistItems]);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return commodities.filter((commodity) => commodity.name.toLowerCase().includes(term) || commodity.symbol.toLowerCase().includes(term)).slice(0, 5);
  }, [commodities, search]);

  const openCommodity = (name: string) => navigate(commodityDetailPath(name));
  const togglePin = (name: string, symbol: string) => {
    const exists = pinned.some((pin) => pin.name === name);
    setPinned(exists ? pinned.filter((pin) => pin.name !== name) : [...pinned, { name, symbol }].slice(0, 5));
  };
  const freshAt = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;

  // pb-24 clears MobileBottomNavigation, a fixed-position bar that only
  // renders below the 768px (`md`) breakpoint (see useIsMobile in
  // components/mobile/MobileBottomNavigation.tsx) — above it there's no bar
  // to clear, so md:pb-6 drops back to normal breathing room instead of
  // leaving dead space at the bottom of the page.
  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-primary">Commodity Hub</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div><h1 className="font-display text-2xl font-semibold">Today</h1><p className="text-xs text-muted-foreground">Your market pulse{freshAt ? ` · updated ${freshAt}` : ''}</p></div>
            <Button size="icon" variant="outline" onClick={() => navigate('/alerts')} aria-label="Open alerts"><Bell className="h-4 w-4" /></Button>
          </div>
          <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search markets" className="pl-9" /></div>
          {matches.length > 0 && <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card shadow-lg">{matches.map((commodity) => <div key={commodity.symbol} className="flex items-center border-b border-border last:border-0"><button type="button" onClick={() => openCommodity(commodity.name)} className="flex flex-1 items-center justify-between px-3 py-3 text-left hover:bg-muted"><span><span className="block text-sm font-medium">{commodity.name}</span><span className="text-xs text-muted-foreground">{commodity.symbol}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground" /></button><Button type="button" variant="ghost" size="icon" className="mr-1 h-9 w-9" onClick={() => togglePin(commodity.name, commodity.symbol)} aria-label={`Pin ${commodity.name}`}><Star className={`h-4 w-4 ${pinned.some((pin) => pin.name === commodity.name) ? 'fill-primary text-primary' : ''}`} /></Button></div>)}</div>}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {triggers.length > 0 && <Card className="border-primary/40 bg-primary/5"><CardContent className="flex items-center gap-3 py-3"><CircleAlert className="h-5 w-5 text-primary" /><button type="button" className="flex-1 text-left" onClick={() => navigate('/alerts')}><p className="text-sm font-semibold">{triggers.length} alert{triggers.length === 1 ? '' : 's'} need review</p><p className="text-xs text-muted-foreground">Open the latest verified trigger details.</p></button><ChevronRight className="h-4 w-4" /></CardContent></Card>}

        <section><div className="mb-2 flex items-center justify-between"><div><h2 className="font-semibold">My markets</h2><p className="text-xs text-muted-foreground">Pinned instruments and your default watchlist</p></div><Button variant="ghost" size="sm" onClick={() => navigate('/watchlists')}>Edit</Button></div>
          {isLoading ? <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading verified prices…</CardContent></Card> : error ? <Card><CardContent className="py-8 text-center text-sm text-destructive">Market data is unavailable. Pull to refresh or try again shortly.</CardContent></Card> : visible.length ? <div className="space-y-2">{visible.map((commodity) => commodity && <Card key={commodity.symbol} className="mobile-card"><CardContent className="flex items-center gap-3 py-3"><button type="button" className="min-w-0 flex-1 text-left" onClick={() => openCommodity(commodity.name)}><p className="truncate text-sm font-semibold">{commodity.name}</p><p className="text-xs text-muted-foreground">{commodity.symbol}</p></button><div className="text-right"><p className="font-mono text-sm font-semibold">{commodity.price > 0 ? formatPrice(commodity.price, commodity.name) : '—'}</p><p className={`flex items-center justify-end gap-1 text-xs ${commodity.changePercent >= 0 ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>{commodity.changePercent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{commodity.changePercent.toFixed(2)}%</p></div><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => togglePin(commodity.name, commodity.symbol)} aria-label={`Unpin ${commodity.name}`}><Star className="h-4 w-4 fill-primary text-primary" /></Button></CardContent></Card>)}</div> : <Card><CardContent className="py-6"><p className="text-sm font-medium">Pin your first market</p><p className="mt-1 text-xs text-muted-foreground">Search above to add up to five instruments to Today.</p></CardContent></Card>}</section>

        <section><div className="mb-2 flex items-center justify-between"><div><h2 className="font-semibold">Alert status</h2><p className="text-xs text-muted-foreground">Monitor your active market levels</p></div><Button variant="ghost" size="sm" onClick={() => navigate('/alerts')}>View all</Button></div><Card><CardContent className="flex items-center justify-between py-4"><div><p className="text-sm font-medium">{alerts.filter((alert) => alert.is_active).length} active alert{alerts.filter((alert) => alert.is_active).length === 1 ? '' : 's'}</p><p className="text-xs text-muted-foreground">Only verified source prices can trigger alerts.</p></div>{auth?.isPremium ? <Button size="sm" onClick={() => navigate('/alerts')}>Manage</Button> : alerts.filter((alert) => alert.is_active).length > 0 ? <Button size="sm" onClick={() => setPaywallOpen(true)}>Get 10 alerts</Button> : <Button size="sm" onClick={() => navigate('/alerts')}>Set one up</Button>}</CardContent></Card></section>

        <section><div className="mb-2 flex items-center justify-between"><div><h2 className="font-semibold">Pro signals</h2><p className="text-xs text-muted-foreground">Daily brief, regimes, spreads, and portfolio risk</p></div>{auth?.isPro && <Badge>Pro</Badge>}</div><Card className={auth?.isPro ? '' : 'border-primary/30 bg-primary/5'}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">{auth?.isPro ? 'Your professional toolkit' : <><Crown className="h-4 w-4 text-primary" />Upgrade your market context</>}</CardTitle><CardDescription>{auth?.isPro ? 'Start with today’s signal feed or drill into a specialist tool.' : 'Get source-backed Daily Briefs, regime scans, spreads, and portfolio analytics.'}</CardDescription></CardHeader><CardContent><Button variant={auth?.isPro ? 'outline' : 'default'} className="w-full" onClick={() => navigate(auth?.isPro ? '/daily-brief' : '/account-settings')}>{auth?.isPro ? 'Open Daily Brief' : 'Explore Pro'}</Button></CardContent></Card></section>
      </main>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} source="today_alert_limit" />
    </div>
  );
};

export default Today;
