import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface COTReport {
  id: string;
  commodity: string;
  report_date: string;
  managed_money_long: number;
  managed_money_short: number;
  commercials_long: number;
  commercials_short: number;
  net_position: number;
  open_interest: number;
}

export const useCOTCommodities = () => {
  return useQuery({
    queryKey: ['cot-commodities'],
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      // Fetch only the latest report week to avoid the default 1000-row
      // PostgREST cap (16 commodities x ~218 weeks of history > 1000 rows).
      const { data: latestRow, error: latestErr } = await supabase
        .from('cot_reports')
        .select('report_date')
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr) throw latestErr;
      if (!latestRow) return [];
      const { data, error } = await supabase
        .from('cot_reports')
        .select('commodity')
        .eq('report_date', latestRow.report_date)
        .order('commodity');
      if (error) throw error;
      const set = new Set<string>();
      for (const row of data ?? []) set.add((row as any).commodity);
      return Array.from(set);
    },
  });
};

export const useCOTHistory = (commodity: string | null) => {
  return useQuery({
    queryKey: ['cot-history', commodity],
    enabled: Boolean(commodity),
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<COTReport[]> => {
      const { data, error } = await supabase
        .from('cot_reports')
        .select('*')
        .eq('commodity', commodity!)
        .order('report_date', { ascending: false })
        .limit(52);
      if (error) throw error;
      return ((data ?? []) as COTReport[]).reverse();
    },
  });
};