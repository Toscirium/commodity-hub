import React from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bell, Heart, Loader, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import SEOHead from '@/components/SEOHead';
import LazyNews from '@/components/LazyNews';
import TradeCTA from '@/components/trade/TradeCTA';
import CommodityContractsTab, { curveIdFor } from '@/components/commodity/CommodityContractsTab';
import CommodityAnalysisTab from '@/components/commodity/CommodityAnalysisTab';

import { useAvailableCommodities, useCommodityPrice } from '@/hooks/useCommodityData';
import { useCommodityDerivedStats } from '@/hooks/useCommodityDerivedStats';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useWatchlists, useWatchlistItems, useAddWatchlistItem, useRemoveWatchlistItem } from '@/hooks/useWatchlists';
import { resolveCommodityBySlug } from '@/lib/commoditySlug';
import { formatHeadlinePrice, getPricePrefix, getPriceUnitLabel } from '@/lib/commodityUtils';
import { getMarketStatus } from '@/lib/marketHours';

const CommodityChart = React.lazy(() => import('@/components/CommodityChart'));

type TabId = 'chart' | 'news' | 'contracts' | 'analysis';

/**
 * The per-commodity detail view.
 *
 * Replaces the expand-in-place card on the dashboard. The point of the route is
 * the chart: on a card it was a ~240px panel with a trade CTA and a news feed
 * stacked underneath, so it competed for the screen with content nobody opened
 * the commodity to read. Here the chart gets the full width and about half the
 * viewport height, and news/contracts/analysis are siblings behind a tab bar
 * instead of things you scroll past it.
 *
 * The active tab lives in the URL (?tab=news) so a link can point at a specific
 * one and the browser/Android back gesture steps through tabs before leaving
 * the page.
 */
const CommodityDetail: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const { toast } = useToast();

  const { data: commodities, isLoading: catalogLoading } = useAvailableCommodities();
  const commodity = React.useMemo(
    () => resolveCommodityBySlug(commodities, slug),
    [commodities, slug],
  );

  // Fall back to the slug itself while the catalog is still in flight, so the
  // header and the chart can start rendering immediately on a cold deep link
  // rather than showing a spinner for the whole page.
  const name = commodity?.name ?? '';
  const { data: livePrice } = useCommodityPrice(name);
  // The catalog leaves weekHigh/weekLow null for most instruments, so fall back
  // to the range derived from a year of closes — same query the Analysis tab
  // uses, shared through the react-query cache.
  const derived = useCommodityDerivedStats(name);

  const price = livePrice?.price ?? commodity?.price ?? null;
  const change = livePrice?.change ?? commodity?.change ?? 0;
  const changePercent = livePrice?.changePercent ?? commodity?.changePercent ?? 0;
  const isPositive = changePercent >= 0;
  const weekHigh = commodity?.weekHigh ?? derived.weekHigh52;
  const weekLow = commodity?.weekLow ?? derived.weekLow52;
  const marketStatus = getMarketStatus(name || (slug ?? ''));

  const hasContracts = Boolean(name && curveIdFor(name));
  const tabs = React.useMemo(() => {
    const base: { id: TabId; label: string }[] = [
      { id: 'chart', label: 'Chart' },
      { id: 'news', label: 'News' },
    ];
    if (hasContracts) base.push({ id: 'contracts', label: 'Contracts' });
    base.push({ id: 'analysis', label: 'Analysis' });
    return base;
  }, [hasContracts]);

  const requestedTab = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = tabs.some((t) => t.id === requestedTab) ? requestedTab! : 'chart';

  const selectTab = (tab: TabId) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'chart') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  };

  // Watchlist toggle. Targets the default watchlist — the header control is a
  // one-tap affordance, and picking among several lists belongs on the
  // Watchlists page, not behind a heart icon.
  const { data: watchlists } = useWatchlists();
  const defaultWatchlist = watchlists?.find((w) => w.is_default) ?? watchlists?.[0] ?? null;
  const { data: watchlistItems } = useWatchlistItems(defaultWatchlist?.id ?? null);
  const addItem = useAddWatchlistItem();
  const removeItem = useRemoveWatchlistItem();
  const watchedItem = watchlistItems?.find((i) => i.commodity_name === name) ?? null;

  const toggleWatch = () => {
    if (!auth?.user) {
      navigate('/auth');
      return;
    }
    if (!defaultWatchlist) {
      toast({ title: 'No watchlist yet', description: 'Create one on the Watchlists page first.' });
      return;
    }
    if (watchedItem) {
      removeItem.mutate({ id: watchedItem.id, watchlistId: defaultWatchlist.id });
      toast({ title: `Removed ${name} from ${defaultWatchlist.name}` });
    } else {
      addItem.mutate({
        watchlistId: defaultWatchlist.id,
        commodity_name: name,
        commodity_symbol: commodity?.symbol ?? null,
      });
      toast({ title: `Added ${name} to ${defaultWatchlist.name}` });
    }
  };

  if (catalogLoading && !commodity) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!commodity) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No commodity matches “{decodeURIComponent(slug ?? '')}”.
        </p>
        <Button onClick={() => navigate('/dashboard')}>Back to markets</Button>
      </div>
    );
  }

  return (
    // Full-bleed everywhere, phone or desktop web — no centered column, no
    // dead margins. The chart and quote stats just use flex/justify-between
    // so they don't collapse into each other on an ultrawide window.
    //
    // min-h-screen + flex flex-col: previously min-h-screen alone just
    // forced this div to a full 100vh with nothing using the extra space —
    // invisible anyway, since <body> already carries the same bg-background
    // (index.css), so a too-short div and a too-tall one look identical.
    // The actual dead-space complaint was the chart itself: capped at a
    // fixed vh/max-h that fell well short of a tall desktop window, worse
    // still when TradeCTA renders nothing at all for Premium/Pro/pro-view
    // accounts (see its own doc comment). flex-col here, paired with
    // flex-1 on the tab-content area below, lets the chart tab's content
    // actually grow to fill the space min-h-screen guarantees, instead of
    // the guarantee going nowhere.
    //
    // pb-24 clears MobileBottomNavigation, a fixed-position bar — but that
    // nav only renders below the same 768px (`md`) breakpoint as
    // useIsMobile (see components/mobile/MobileBottomNavigation.tsx). Above
    // it there's no bar to clear, so the unconditional pb-24 was dead space
    // in its own right too; md:pb-6 drops back to normal breathing room
    // once the nav is gone.
    <div className="min-h-screen flex flex-col w-full bg-background pb-24 md:pb-6">
      <SEOHead
        title={`${commodity.name} price, chart and news`}
        description={`Live ${commodity.name} (${commodity.symbol}) price on ${commodity.venue}, interactive chart, contract ladder and market news.`}
      />

      {/* Identity bar — pinned, because on a long news list the price is the
          one thing you always want in view. app-top-bar handles the Android
          status-bar inset (see index.css). */}
      <header className="app-top-bar sticky top-0 z-40 w-full shrink-0 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex h-14 w-full items-center gap-2 px-2 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="h-10 w-10 shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-mono text-[15px] font-semibold uppercase tracking-tight text-foreground">
              {commodity.symbol}
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {commodity.name} · {commodity.venue}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleWatch}
            className="h-10 w-10 shrink-0"
            aria-label={watchedItem ? `Remove ${commodity.name} from watchlist` : `Add ${commodity.name} to watchlist`}
            aria-pressed={Boolean(watchedItem)}
          >
            <Heart className={`h-5 w-5 ${watchedItem ? 'fill-primary text-primary' : ''}`} />
          </Button>
          <Button variant="ghost" size="icon" asChild className="h-10 w-10 shrink-0">
            <Link to="/alerts" aria-label="Price alerts">
              <Bell className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Quote block: headline price on the left, reference stats on the right,
          the way every trading app lays this out. */}
      <div className="shrink-0 flex w-full flex-wrap items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="number-display text-[40px] font-medium leading-none tabular-nums tracking-tight text-foreground">
              {price !== null ? `${getPricePrefix(commodity.name)}${formatHeadlinePrice(price)}` : '—'}
            </span>
            <span className="text-[11px] text-muted-foreground">{getPriceUnitLabel(commodity.name)}</span>
          </div>
          <div
            className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${
              isPositive ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--destructive))]'
            }`}
          >
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="number-display tabular-nums">
              {isPositive ? '+' : '−'}
              {Math.abs(change).toFixed(2)}
            </span>
            <span className="number-display tabular-nums">
              {isPositive ? '+' : '−'}
              {Math.abs(changePercent).toFixed(2)}%
            </span>
            <span className="ml-1 flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  marketStatus.isOpen ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'
                }`}
              />
              {marketStatus.isOpen ? 'Open' : 'Closed'}
            </span>
          </div>
        </div>

        <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-muted-foreground">52W H/L</dt>
          <dd className="number-display text-right tabular-nums text-foreground">
            {weekHigh != null && weekLow != null
              ? `${weekHigh.toFixed(2)}–${weekLow.toFixed(2)}`
              : '—'}
          </dd>
          <dt className="text-muted-foreground">Vol</dt>
          <dd className="number-display text-right tabular-nums text-foreground">
            {commodity.volumeDisplay ?? commodity.volume?.toLocaleString() ?? '—'}
          </dd>
          <dt className="text-muted-foreground">Size</dt>
          <dd className="number-display text-right tabular-nums text-foreground">
            {commodity.contractSize ?? '—'}
          </dd>
        </dl>
      </div>

      {/* Tab bar — underline style, scrollable so it never wraps on a narrow
          screen. Sticky under the header for the same reason the header is. */}
      <nav
        className="sticky z-30 w-full shrink-0 border-b border-border bg-background"
        style={{ top: 'calc(var(--app-top-buffer, 0px) + 3.5rem)' }}
        aria-label="Commodity sections"
      >
        <div className="flex w-full gap-1 overflow-x-auto px-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => selectTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* flex-1 min-h-0: grows to consume whatever the page's min-h-screen
          guarantees but the header/quote/tabs above don't use — see the
          wrapper div's own comment. Only matters visually for the chart
          tab (its content can actually grow via CommodityChart's matching
          flex-1); news/contracts/analysis just render at their natural
          height either way, same as before. */}
      <div className="flex-1 flex flex-col min-h-0 w-full min-w-0">
        {activeTab === 'chart' && (
          <React.Suspense
            fallback={
              <div className="flex flex-1 min-h-[280px] items-center justify-center">
                <Loader className="h-6 w-6 animate-spin text-primary" />
              </div>
            }
          >
            <CommodityChart
              variant="page"
              name={commodity.name}
              basePrice={price ?? 0}
              selectedContract={commodity.symbol}
            />
            <div className="shrink-0 px-4">
              <TradeCTA symbol={commodity.symbol} commodityName={commodity.name} />
            </div>
          </React.Suspense>
        )}

        {activeTab === 'news' && (
          <div className="px-3 py-3 sm:px-4">
            <LazyNews commodity={commodity.name} embedded />
          </div>
        )}

        {activeTab === 'contracts' && (
          <ErrorBoundary>
            <CommodityContractsTab commodityName={commodity.name} />
          </ErrorBoundary>
        )}

        {activeTab === 'analysis' && (
          <CommodityAnalysisTab commodityName={commodity.name} commodity={commodity} />
        )}
      </div>
    </div>
  );
};

export default CommodityDetail;
