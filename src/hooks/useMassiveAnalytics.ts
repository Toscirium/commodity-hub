import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function authedInvoke<T>(fn: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;
  const expMs = (session?.expires_at ?? 0) * 1000;
  if (session && expMs < Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    session = refreshed.data.session;
  }
  if (!session?.access_token) throw new Error('Authentication required');
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  return data as T;
}

export interface RollScannerRow {
  id: string;
  label: string;
  code: string;
  category: string;
  asOf?: string;
  m1?: number;
  m2?: number;
  mLast?: number;
  contracts?: number;
  rollM1M2?: number;
  annualizedRoll?: number;
  fullSlope?: number;
  structure?: 'contango' | 'backwardation' | 'flat';
  frontExpiry?: string;
  lastExpiry?: string;
  error?: string;
}

export interface RollScannerResponse {
  generatedAt: string;
  provider: string;
  results: RollScannerRow[];
  stale?: boolean;
  asOf?: string;
}

export const useRollScanner = (enabled = true) =>
  useQuery({
    queryKey: ['massive-roll-scanner'],
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: () => authedInvoke<RollScannerResponse>('massive-roll-scanner', {}),
  });

export interface VolConeBucket {
  window: number;
  current: number | null;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  note?: 'insufficient_history';
}

export interface VolConeResponse {
  commodity: string;
  label: string;
  provider: string;
  asOf: string;
  bars: number;
  cone: VolConeBucket[];
  currentVol: number | null;
  percentile1y: number | null;
  headlineWindow?: 10 | 20 | null;
  stale?: boolean;
}

export const useVolCone = (commodity: string | null) =>
  useQuery({
    queryKey: ['massive-vol-cone', commodity],
    enabled: Boolean(commodity),
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: () => authedInvoke<VolConeResponse>('massive-vol-cone', { commodity }),
  });

export interface TermStructurePoint {
  symbol: string;
  expiry: string;
  monthIdx: number;
  current: number;
  weekAgo: number | null;
  monthAgo: number | null;
}

export interface TermStructureResponse {
  commodity: string;
  label: string;
  provider: string;
  asOf: string;
  weekAgoDate: string;
  monthAgoDate: string;
  points: TermStructurePoint[];
}

export const useTermStructure = (commodity: string | null) =>
  useQuery({
    queryKey: ['massive-term-structure', commodity],
    enabled: Boolean(commodity),
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: () => authedInvoke<TermStructureResponse>('massive-term-structure', { commodity }),
  });

export const MASSIVE_ANALYTICS_PRODUCTS = [
  { id: 'wti',     label: 'WTI Crude' },
  { id: 'brent',   label: 'Brent Crude' },
  { id: 'gold',     label: 'Gold' },
  { id: 'silver',   label: 'Silver' },
  { id: 'copper',   label: 'Copper' },
  { id: 'platinum', label: 'Platinum' },
  { id: 'palladium',label: 'Palladium' },
  { id: 'corn',     label: 'Corn' },
  { id: 'wheat',    label: 'Wheat' },
  { id: 'soybeans', label: 'Soybeans' },
  { id: 'cattle',   label: 'Live Cattle' },
  { id: 'hogs',     label: 'Lean Hogs' },
  { id: 'lumber',   label: 'Lumber' },
];