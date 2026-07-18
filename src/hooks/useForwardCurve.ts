import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ForwardCurvePoint {
  symbol: string;
  expiry: string;       // YYYY-MM
  monthIdx: number;
  price: number;
}

export interface ForwardCurveResponse {
  commodity: string;
  label: string;
  source: 'market';
  provider: string;
  asOf: string;         // YYYY-MM-DD settlement date
  spot: number;
  curve: ForwardCurvePoint[];
  m1: number | null;
  m2: number | null;
  structure: 'contango' | 'backwardation' | 'flat' | 'unknown';
  rollYield: number | null;
}

export const useForwardCurve = (commodity: string | null, enabled = true) => {
  return useQuery({
    queryKey: ['forward-curve', commodity],
    enabled: Boolean(commodity) && enabled,
    staleTime: 6 * 60 * 60 * 1000, // 6h — matches edge cache
    queryFn: async (): Promise<ForwardCurveResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData.session;
      const expiresAtMs = (session?.expires_at ?? 0) * 1000;
      if (session && expiresAtMs < Date.now() + 60_000) {
        const refreshed = await supabase.auth.refreshSession();
        session = refreshed.data.session;
      }
      if (!session?.access_token) {
        throw new Error('Authentication required');
      }
      const { data, error } = await supabase.functions.invoke('fetch-forward-curve', {
        body: { commodity, monthsAhead: 12 },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (error) throw error;
      return data as ForwardCurveResponse;
    },
  });
};
