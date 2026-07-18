import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OptionsProduct = 'CL' | 'NG' | 'GC' | 'ZC' | 'ZS';

export interface OptionsExpiration { code: string; label: string; expirationDate?: string }
export interface OptionsChainRow {
  strike: number;
  callSettle: number | null;
  callVolume: number | null;
  callOpenInterest: number | null;
  putSettle: number | null;
  putVolume: number | null;
  putOpenInterest: number | null;
}

export interface OptionsChainResponse {
  product: string;
  productLabel: string;
  expirations: OptionsExpiration[];
  expiration: string;
  expirationDate: string | null;
  underlying: number | null;
  tradeDate: string | null;
  rows: OptionsChainRow[];
  cached?: boolean;
  error?: string;
  hint?: string;
}

export interface UseOptionsChainOptions {
  enabled?: boolean;
  retry?: boolean | number;
}

export function useOptionsChain(
  product: OptionsProduct,
  expiration?: string,
  options?: UseOptionsChainOptions
) {
  return useQuery({
    queryKey: ['options-chain', product, expiration ?? 'front'],
    queryFn: async (): Promise<OptionsChainResponse> => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.access_token) throw new Error('Authentication required');
      const { data, error } = await supabase.functions.invoke('fetch-options-chain', {
        body: { product, expiration },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      return data as OptionsChainResponse;
    },
    staleTime: 60 * 60 * 1000, // 1 hour client cache
    refetchOnWindowFocus: false,
    enabled: options?.enabled ?? true,
    retry: options?.retry ?? 3,
  });
}