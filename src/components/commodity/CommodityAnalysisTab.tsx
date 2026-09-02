import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Commodity } from '@/hooks/useCommodityData';
import { getMarketStatusText } from '@/lib/marketHours';
import { useCommodityDerivedStats } from '@/hooks/useCommodityDerivedStats';

/**
 * Reference stats and the jump-off points to the deeper analytics.
 *
 * The stats prefer the catalog record — the same fields the Market Screener
 * sorts on — and fall back to values derived from a year of closes, because
 * the current provider leaves weekHigh/weekLow/volatility null for most
 * instruments and this grid was otherwise a column of em dashes. What's left
 * unavailable stays an em dash rather than hidden: a missing figure is itself
 * information, and collapsing the grid would make the layout jump between
 * commodities.
 *
 * The links are plain navigation. Those pages each carry their own commodity
 * selector and don't read a query param today, so passing one would only look
 * like it worked.
 */

const ANALYTICS_LINKS: { label: string; description: string; to: string }[] = [
  { label: 'Seasonality', description: 'Average monthly pattern across years', to: '/seasonality' },
  { label: 'Forward Curves', description: 'Settlement strip, contango vs backwardation', to: '/forward-curves' },
  { label: 'Term Structure', description: 'Front-month spreads over time', to: '/term-structure' },
  { label: 'Volatility Cone', description: 'Realised vol against its own history', to: '/volatility-cone' },
  { label: 'COT Reports', description: 'Commitment of Traders positioning', to: '/cot-reports' },
  { label: 'Fundamentals', description: 'Supply, demand and inventory series', to: '/fundamentals' },
  { label: 'Correlation', description: 'How this moves against other markets', to: '/market-correlation' },
  { label: 'Price Alerts', description: 'Get notified when it crosses a level', to: '/alerts' },
];

interface Props {
  commodityName: string;
  commodity?: Commodity;
}

const Stat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="border-b border-border/50 px-4 py-2.5">
    <div className="terminal-label mb-1">{label}</div>
    <div className="number-display text-[13px] tabular-nums text-foreground">{value ?? '—'}</div>
  </div>
);

const CommodityAnalysisTab: React.FC<Props> = ({ commodityName, commodity }) => {
  const derived = useCommodityDerivedStats(commodityName);
  const fmt = (v: number | null | undefined, digits = 2) =>
    typeof v === 'number' ? v.toFixed(digits) : '—';

  const weekHigh = commodity?.weekHigh ?? derived.weekHigh52;
  const weekLow = commodity?.weekLow ?? derived.weekLow52;
  const volatility = commodity?.volatility ?? derived.realisedVol;

  return (
    <div className="w-full min-w-0">
      <div className="grid grid-cols-2 sm:grid-cols-3">
        <Stat label="52W High" value={fmt(weekHigh)} />
        <Stat label="52W Low" value={fmt(weekLow)} />
        <Stat
          label="Volatility"
          value={
            volatility != null ? (
              <>
                {fmt(volatility)}%
                {commodity?.volatility == null && (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">ann. realised</span>
                )}
              </>
            ) : (
              '—'
            )
          }
        />
        <Stat label="Volume" value={commodity?.volumeDisplay ?? (commodity?.volume?.toLocaleString() || '—')} />
        <Stat label="Avg Volume" value={commodity?.avgVolume?.toLocaleString() ?? '—'} />
        <Stat label="Beta" value={commodity?.beta ?? '—'} />
        <Stat label="Venue" value={commodity?.venue ?? '—'} />
        <Stat label="Contract Size" value={commodity?.contractSize ?? '—'} />
        <Stat label="Session" value={getMarketStatusText(commodityName)} />
      </div>

      <div className="px-4 pb-2 pt-5">
        <h3 className="terminal-label">Deeper analysis</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {ANALYTICS_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex items-center gap-3 border-b border-border/50 px-4 py-3 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-foreground">{link.label}</div>
              <div className="truncate text-[11px] text-muted-foreground">{link.description}</div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          </Link>
        ))}
      </div>
    </div>
  );
};

export default CommodityAnalysisTab;
