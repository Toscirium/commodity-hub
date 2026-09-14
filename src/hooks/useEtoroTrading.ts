// eToro demo-account trading — see supabase/functions/etoro-auth and
// etoro-trading for the server side, and their file-level comments for why
// this is demo-scoped only. Two edge functions: etoro-auth (connect/
// disconnect handshake) and etoro-trading (portfolio/orders/history for an
// already-connected user).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function invoke<T>(fn: 'etoro-auth' | 'etoro-trading', body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) throw new Error('Authentication required');
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.message ?? data.error);
  return data as T;
}

export interface EtoroStatus {
  connected: boolean;
  scopes: string | null;
  connectedAt: string | null;
}

export const useEtoroStatus = (enabled = true) =>
  useQuery({
    queryKey: ['etoro', 'status'],
    queryFn: () => invoke<EtoroStatus>('etoro-trading', { action: 'status' }),
    enabled,
    staleTime: 60_000,
  });

export interface EtoroPositionAggregate {
  instrumentId: number;
  assetCurrency: string;
  netUnits: number | null;
  netContracts: number | null;
  avgOpenRate: number;
  netCurrentExposureAccountCurrency: number;
  accountCurrencyReturn: number;
  avgLeverage: number;
}

export interface EtoroPortfolio {
  cid: number;
  timestamp: string;
  accountCurrency: string;
  accountTotals?: Record<string, number>;
  instrumentAggregates: EtoroPositionAggregate[];
}

export const useEtoroPortfolio = (enabled: boolean) =>
  useQuery({
    queryKey: ['etoro', 'portfolio'],
    queryFn: () => invoke<EtoroPortfolio>('etoro-trading', { action: 'portfolio' }),
    enabled,
    staleTime: 30_000,
    refetchInterval: enabled ? 60_000 : false,
  });

/** Starts the OAuth handshake and hands back the authorization URL to redirect the whole page to. */
export const useConnectEtoro = () =>
  useMutation({
    mutationFn: () => invoke<{ authorizationUrl: string }>('etoro-auth', { action: 'start' }),
  });

export const useDisconnectEtoro = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => invoke<{ disconnected: boolean }>('etoro-auth', { action: 'disconnect' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etoro'] });
    },
  });
};

export interface PlaceEtoroOrderInput {
  commodity: string;
  transaction: 'buy' | 'sellShort';
  amount: number;
  leverage?: number;
}

export interface PlaceEtoroOrderResult {
  orderId: number;
  referenceId: string;
  instrument: string;
}

export const usePlaceEtoroOrder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceEtoroOrderInput) =>
      invoke<PlaceEtoroOrderResult>('etoro-trading', { action: 'place_order', ...input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etoro', 'portfolio'] });
    },
  });
};

export interface EtoroHistoryEntry {
  positionId?: number;
  instrumentId: number;
  openDateTime?: string;
  closeDateTime?: string;
  profitAccountCurrency?: number;
  [key: string]: unknown;
}

export const useEtoroHistory = (enabled: boolean) =>
  useQuery({
    queryKey: ['etoro', 'history'],
    queryFn: () => invoke<{ trades?: EtoroHistoryEntry[] }>('etoro-trading', { action: 'history' }),
    enabled,
    staleTime: 60_000,
  });

/** Completes the OAuth handshake from the /etoro/callback route. */
export const useCompleteEtoroConnection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { code: string; state: string }) =>
      invoke<{ connected: boolean }>('etoro-auth', { action: 'callback', ...params }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['etoro'] });
    },
  });
};
