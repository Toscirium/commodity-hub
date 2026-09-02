import React from 'react';
import { Link } from 'react-router-dom';
import { Lock, TrendingDown, TrendingUp, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useForwardCurve } from '@/hooks/useForwardCurve';
import { CURVE_COMMODITIES } from '@/utils/forwardCurveSymbols';

/**
 * The contract ladder for one commodity: every listed monthly future with its
 * settlement price and its spread to the front month.
 *
 * The catalog has no per-contract feed of its own — CommodityCard's contract
 * dropdown was wired to an `availableContracts` prop that no caller has ever
 * passed — so the real source here is the forward curve, which returns exactly
 * this (symbol, expiry, settlement) for the next 12 months. That makes the tab
 * Pro-gated and limited to the nine commodities with a curve mapping, which is
 * why curveIdFor() is exported: the detail page hides the tab entirely rather
 * than showing an empty one.
 */
export const curveIdFor = (commodityName: string): string | null => {
  const n = commodityName.toLowerCase();
  const match = CURVE_COMMODITIES.find((c) => {
    const label = c.label.toLowerCase();
    return n === label || n.includes(label) || label.includes(n);
  });
  return match?.id ?? null;
};

interface Props {
  commodityName: string;
}

const CommodityContractsTab: React.FC<Props> = ({ commodityName }) => {
  const auth = useAuth();
  const isPro = auth?.isPro ?? false;
  const curveId = curveIdFor(commodityName);
  const { data, isLoading, error } = useForwardCurve(isPro ? curveId : null);

  if (!isPro) {
    return (
      <div className="px-4 py-10 text-center">
        <Lock className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
        <p className="mb-1 text-sm font-semibold text-foreground">Contract ladder is a Pro feature</p>
        <p className="mx-auto mb-4 max-w-sm text-xs text-muted-foreground">
          See every listed monthly contract for {commodityName} with its settlement price and spread
          to the front month.
        </p>
        <Button asChild size="sm">
          <Link to="/account-settings">Upgrade to Pro</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading contract ladder…</p>;
  }

  if (error || !data?.curve?.length) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        No settlement curve available right now — the latest session may not be settled yet.
      </p>
    );
  }

  const front = data.m1 ?? data.curve[0].price;
  const StructureIcon =
    data.structure === 'backwardation' ? TrendingDown : data.structure === 'contango' ? TrendingUp : Activity;
  const structureColor =
    data.structure === 'contango'
      ? 'text-orange-500'
      : data.structure === 'backwardation'
        ? 'text-emerald-500'
        : 'text-muted-foreground';

  return (
    <div className="w-full min-w-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${structureColor}`}>
          <StructureIcon className="h-3.5 w-3.5" />
          {data.structure}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">Settled {data.asOf}</span>
      </div>

      {/* Column headers, then one row per contract. Spread is against the front
          month rather than spot so the sign reads the way a trader expects:
          positive = later months are dearer = contango. */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border px-4 py-2 terminal-label">
        <span>Contract</span>
        <span className="text-right">Settle</span>
        <span className="w-20 text-right">vs M1</span>
      </div>

      {data.curve.map((point) => {
        const spread = point.price - front;
        const spreadPct = front ? (spread / front) * 100 : 0;
        return (
          <div
            key={point.symbol}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border/50 px-4 py-2.5"
          >
            <div className="min-w-0">
              <div className="truncate font-mono text-[13px] font-medium text-foreground">{point.symbol}</div>
              <div className="text-[11px] text-muted-foreground">
                {point.expiry} · M{point.monthIdx}
              </div>
            </div>
            <span className="number-display text-[13px] tabular-nums text-foreground">
              {point.price.toFixed(2)}
            </span>
            <span
              className={`number-display w-20 text-right text-[12px] tabular-nums ${
                spread > 0
                  ? 'text-[hsl(var(--warning))]'
                  : spread < 0
                    ? 'text-[hsl(var(--success))]'
                    : 'text-muted-foreground'
              }`}
            >
              {spread > 0 ? '+' : ''}
              {spread.toFixed(2)}
              <span className="ml-1 text-[10px] opacity-70">
                {spread > 0 ? '+' : ''}
                {spreadPct.toFixed(1)}%
              </span>
            </span>
          </div>
        );
      })}

      <div className="px-4 py-3">
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link to="/forward-curves">Open full forward curve</Link>
        </Button>
      </div>
    </div>
  );
};

export default CommodityContractsTab;
