import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

import { useHaptics } from '@/hooks/useHaptics';
import { usePriceFlash } from '@/hooks/usePriceFlash';
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
   * - 'stale':          a stored snapshot older than any plausible settlement
   * - 'reference':      weekly reference price, no intraday signal
   */
  dataFreshness?: 'live' | 'eod' | 'stale' | 'reference';
  /**
   * When true the change figures are placeholders rather than measured. The
   * row renders "—" instead of a number: claiming a flat 0.00% market is a
   * substantive and wrong assertion, whereas "unknown" is merely honest.
   */
  changeUnknown?: boolean;
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
  changeUnknown = false,
}) => {
  const navigate = useNavigate();
  const { vibrateTouch } = useHaptics();
  const marketStatus = getMarketStatus(name);
  const flash = usePriceFlash(price);

  // Three-way, not two. `changePercent >= 0` painted a dead-flat market in
  // full success green with a "+" in front of it — a screen of "+0.00%" in
  // green is actively misleading, and reading a rounded-to-zero move as a
  // gain is exactly the sort of imprecision that costs a market product its
  // credibility. The threshold is the set of values that *display* as 0.00,
  // so nothing can render as "−0.00%" either.
  const direction: 'up' | 'down' | 'flat' =
    Math.abs(changePercent) < 0.005 ? 'flat' : changePercent > 0 ? 'up' : 'down';

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
      className="terminal-card press-effect group flex w-full min-w-0 max-w-full cursor-pointer touch-manipulation items-center gap-3 border border-border bg-card px-3.5 py-3 hover:border-primary/55 hover:bg-muted/30 active:bg-muted/50 focus-ring"
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
                  : dataFreshness === 'stale'
                    ? 'border border-[hsl(var(--destructive))]/50 text-[hsl(var(--destructive))]'
                    : 'border border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]'
              }`}
              title={
                dataFreshness === 'eod'
                  ? 'End-of-day settlement price — refreshed once per trading day.'
                  : dataFreshness === 'stale'
                    ? 'Stale — the most recent stored price is older than the expected refresh window. Do not treat this as a current quote.'
                    : 'Reference price — published weekly, no intraday signal.'
              }
            >
              {dataFreshness === 'eod' ? 'EOD' : dataFreshness === 'stale' ? 'STALE' : 'REF'}
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
        {/* px-1 -mx-1 gives the tick flash a little body to tint without
            taking any layout space from the row. */}
        <span
          className={`number-display -mx-1 rounded-sm px-1 text-[17px] font-medium tabular-nums tracking-tight text-foreground sm:text-[18px] ${
            flash === 'up' ? 'price-flash-up' : flash === 'down' ? 'price-flash-down' : ''
          }`}
        >
          {price !== null ? (
            `${getPricePrefix(name)}${formatHeadlinePrice(price)}`
          ) : (
            <span className="text-base text-muted-foreground">—</span>
          )}
        </span>
        {changeUnknown ? (
          <span
            className="number-display min-w-[68px] border border-dashed border-border px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-muted-foreground"
            title="Change unavailable for this price — it came from a stored snapshot, not a live quote."
          >
            —
          </span>
        ) : (
          <span
            className={`number-display min-w-[68px] px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${
              direction === 'flat'
                ? 'bg-muted text-muted-foreground'
                : direction === 'up'
                  ? 'bg-[hsl(var(--success))] text-white'
                  : 'bg-[hsl(var(--destructive))] text-white'
            }`}
          >
            {direction === 'up' ? '+' : direction === 'down' ? '−' : ''}
            {Math.abs(changePercent).toFixed(2)}%
          </span>
        )}
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
