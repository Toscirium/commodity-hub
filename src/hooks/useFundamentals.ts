import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FundamentalObservation {
  period: string;
  value: number;
}

export type FundamentalDataset = 'petroleum' | 'natgas_storage' | 'weather' | 'usda' | 'rigs' | 'all';

export interface FundamentalSeries {
  series_id: string;
  dataset: FundamentalDataset;
  label: string;
  unit: string | null;
  observations: FundamentalObservation[];
  latest_value: number | null;
  latest_period: string | null;
  wow_change: number | null;
  yoy_change: number | null;
  five_year_avg: number | null;
  updated_at: string;
}

interface FundamentalsResponse {
  rows: FundamentalSeries[];
  cached: boolean;
}

async function invokeFundamentals(dataset: FundamentalDataset = 'all', force = false): Promise<FundamentalsResponse> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) throw new Error('Authentication required');
  const { data, error } = await supabase.functions.invoke('fetch-fundamentals', {
    body: { dataset, force },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  return data as FundamentalsResponse;
}

export function useFundamentals(dataset: FundamentalDataset = 'all') {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['fundamentals', dataset],
    queryFn: () => invokeFundamentals(dataset),
    staleTime: 30 * 60 * 1000, // 30 min client cache; backend already caches 6h
    refetchOnWindowFocus: false,
  });
  const forceRefresh = async () => {
    const fresh = await invokeFundamentals(dataset, true);
    queryClient.setQueryData(['fundamentals', dataset], fresh);
    return fresh;
  };
  return { ...query, forceRefresh };
}
