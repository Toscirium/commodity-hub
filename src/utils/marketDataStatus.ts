export type MarketDataStatus = 'live' | 'delayed' | 'eod' | 'reference' | 'stale' | 'unavailable';

export interface MarketDataProvenance {
  status: MarketDataStatus;
  source?: string;
  asOf?: string | null;
  refreshLabel?: string;
}

export const marketDataStatusLabel: Record<MarketDataStatus, string> = {
  live: 'LIVE',
  delayed: 'DELAYED',
  eod: 'EOD',
  reference: 'REF',
  stale: 'STALE',
  unavailable: 'UNAVAILABLE',
};

export const marketDataStatusDescription: Record<MarketDataStatus, string> = {
  live: 'Streaming or near-real-time market data.',
  delayed: 'Market data is intentionally delayed by the source.',
  eod: 'End-of-day settlement data.',
  reference: 'Reference pricing, not an intraday trading signal.',
  stale: 'The latest source update is older than the expected refresh window.',
  unavailable: 'No verified market data is currently available.',
};

export const formatAsOf = (asOf?: string | null): string => {
  if (!asOf) return 'As of time unavailable';
  const date = new Date(asOf);
  if (Number.isNaN(date.getTime())) return 'As of time unavailable';
  return `As of ${date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
};
