import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { useHaptics } from '@/hooks/useHaptics';
import { getMarketStatus } from '@/lib/marketHours';
import { getPriceUnitLabel, getPricePrefix, formatHeadlinePrice } from '@/lib/commodityUtils';
import { commodityDetailPath } from '@/lib/commoditySlug';

interface CommodityCardProps {
  name: string;
  symbol: string;
  price: number | null;
  change: number;
  changePercent: number;
  volume?: string;
  lastUpdate?: string;
  venue?: string;
  contractSize?: string;
  category?: string;
  /**
   * Data freshness tier surfaced as a small badge next to the venue.
   * - 'live' (default): minute/hour-fresh exchange feed
   * - 'eod':            daily settlement only (Platts/Argus-style)
   * - 'reference':      weekly reference price, no intraday signal
   */
  dataFreshness?: 'live' | 'eod' | 'reference';
}

/**
 * One row in the markets list.
 *
 * This used to be a collapsible card that expanded in place to reveal a chart,
 * a trade CTA and a news feed stacked on top of each other. That made the
 * chart a small boxed panel wedged between other content — the least usable
 * part of the app despite being the reason people open it. The chart now lives
 * on its own route (see src/pages/CommodityDetail.tsx) where it gets the full
 * width and roughly half the viewport height, and news moved into a sibling
 * tab rather than sitting underneath it.
 *
 * So this is a list row: dense, scannable, and its entire job is to show a
 * quote and navigate. Left column identifies the contract, right column is the
 * quote, with change styled as a solid block the way trading apps do it so a
 * column of rows reads green/red at a glance.
 */
const CommodityCard = React.memo<CommodityCardProps>(({
  name,
  symbol,
  price,
  changePercent,
  venue = 'NYMEX',
  contractSize,
  dataFreshness = 'live',
}) => {
  const navigate = useNavigate();
  const { vibrateTouch } = useHaptics();
  const marketStatus = getMarketStatus(name);

  const isPositive = changePercent >= 0;

  const open = React.useCallback(() => {
    vibrateTouch();
    navigate(commodityDetailPath(name));
  }, [navigate, name, vibrateTouch]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={handleKeyDown}
      aria-label={`${name} — open detail view`}
      className="terminal-card group flex w-full min-w-0 max-w-full cursor-pointer touch-manipulation items-center gap-3 border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary/55 hover:bg-muted/30 active:bg-muted/50 focus-ring"
    >
      {/* Identity */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate font-mono text-[14px] font-medium tracking-tight text-foreground sm:text-[15px]">
            {name}
          </h3>
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              marketStatus.isOpen ? 'bg-[hsl(var(--success))]' : 'bg-muted-foreground/40'
            }`}
            title={marketStatus.isOpen ? 'Market open' : 'Market closed'}
          />
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden">
          <span className="shrink-0 bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
            {symbol}
          </span>
          <span className="shrink-0 border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-wide text-muted-foreground">
            {venue}
          </span>
          {dataFreshness !== 'live' && (
            <span
              className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                dataFreshness === 'eod'
                  ? 'border border-border text-muted-foreground'
                  : 'border border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]'
              }`}
              title={
                dataFreshness === 'eod'
                  ? 'End-of-day settlement price — refreshed once per trading day.'
                  : 'Reference price — published weekly, no intraday signal.'
              }
            >
              {dataFreshness === 'eod' ? 'EOD' : 'REF'}
            </span>
          )}
          {contractSize && (
            <span className="hidden truncate text-[10px] tracking-wide text-muted-foreground/80 sm:inline">
              {contractSize}
            </span>
          )}
        </div>
      </div>

      {/* Quote */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="number-display text-[17px] font-medium tabular-nums tracking-tight text-foreground sm:text-[18px]">
          {price !== null ? (
            `${getPricePrefix(name)}${formatHeadlinePrice(price)}`
          ) : (
            <span className="text-base text-muted-foreground">—</span>
          )}
        </span>
        <span
          className={`number-display min-w-[68px] px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-white ${
            isPositive ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--destructive))]'
          }`}
        >
          {isPositive ? '+' : '−'}
          {Math.abs(changePercent).toFixed(2)}%
        </span>
      </div>

      <div className="hidden shrink-0 text-right text-[10px] leading-tight text-muted-foreground/70 sm:block">
        {getPriceUnitLabel(name)}
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-foreground" />
    </div>
  );
});

CommodityCard.displayName = 'CommodityCard';

export default CommodityCard;
