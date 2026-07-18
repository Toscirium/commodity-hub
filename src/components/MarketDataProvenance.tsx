import { CircleAlert, Clock3, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  formatAsOf,
  marketDataStatusDescription,
  marketDataStatusLabel,
  type MarketDataProvenance as Provenance,
} from '@/utils/marketDataStatus';

const statusClass: Record<Provenance['status'], string> = {
  live: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  delayed: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  eod: 'border-border bg-muted text-muted-foreground',
  reference: 'border-border bg-muted text-muted-foreground',
  stale: 'border-destructive/40 bg-destructive/10 text-destructive',
  unavailable: 'border-destructive/40 bg-destructive/10 text-destructive',
};

export const MarketDataProvenance = ({ provenance, compact = false }: { provenance: Provenance; compact?: boolean }) => (
  <div className={compact ? 'flex items-center gap-2 text-xs text-muted-foreground' : 'rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5'}>
    <Badge variant="outline" className={`text-[10px] ${statusClass[provenance.status]}`} title={marketDataStatusDescription[provenance.status]}>
      {marketDataStatusLabel[provenance.status]}
    </Badge>
    {!compact && <p className="flex items-center gap-1.5"><Database className="h-3.5 w-3.5" />{provenance.source ?? 'Verified Commodity Hub dataset'}</p>}
    <p className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{formatAsOf(provenance.asOf)}{provenance.refreshLabel ? ` · ${provenance.refreshLabel}` : ''}</p>
    {!compact && (provenance.status === 'stale' || provenance.status === 'unavailable') && <p className="flex items-center gap-1.5 text-destructive"><CircleAlert className="h-3.5 w-3.5" />Do not use this value as a current trading signal.</p>}
  </div>
);
