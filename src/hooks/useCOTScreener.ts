import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { COTReport } from './useCOT';

export interface COTExtreme {
  commodity: string;
  latestReportDate: string;
  netPosition: number;
  managedMoneyLong: number;
  managedMoneyShort: number;
  commercialsLong: number;
  commercialsShort: number;
  openInterest: number;
  netPercentile: number; // 0-100 vs 52-week history
  netSignal: 'extreme_long' | 'extreme_short' | 'neutral';
  commercialDivergence: number; // commercial net - managed money net (positive = commercials are net long while specs are short)
  commercialSignal: 'smart_long' | 'smart_short' | 'neutral';
  oiPercentile: number;
}

function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 50;
  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.filter((v) => v <= value).length;
  return (count / sorted.length) * 100;
}

export function useCOTScreener() {
  return useQuery({
    queryKey: ['cot-screener'],
    staleTime: 60 * 60 * 1000,
    queryFn: async (): Promise<COTExtreme[]> => {
      const { data, error } = await supabase
        .from('cot_reports')
        .select('*')
        .order('report_date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = (data ?? []) as COTReport[];
      if (rows.length === 0) return [];

      // Group by commodity and keep last 52 weeks per commodity
      const byCommodity = new Map<string, COTReport[]>();
      for (const row of rows) {
        const arr = byCommodity.get(row.commodity) ?? [];
        if (arr.length < 52) {
          arr.push(row);
          byCommodity.set(row.commodity, arr);
        }
      }

      const results: COTExtreme[] = [];
      for (const [commodity, history] of byCommodity.entries()) {
        if (history.length === 0) continue;
        const latest = history[0];
        const nets = history.map((h) => h.net_position).reverse();
        const ois = history.map((h) => h.open_interest).reverse();
        const netPercentile = percentileRank(latest.net_position, nets);
        const oiPercentile = percentileRank(latest.open_interest, ois);
        const commercialNet = latest.commercials_long - latest.commercials_short;
        const managedNet = latest.net_position;
        const commercialDivergence = commercialNet - managedNet;

        let netSignal: COTExtreme['netSignal'] = 'neutral';
        if (netPercentile >= 90) netSignal = 'extreme_long';
        else if (netPercentile <= 10) netSignal = 'extreme_short';

        let commercialSignal: COTExtreme['commercialSignal'] = 'neutral';
        if (commercialDivergence > 0 && managedNet < 0) commercialSignal = 'smart_long';
        else if (commercialDivergence < 0 && managedNet > 0) commercialSignal = 'smart_short';

        results.push({
          commodity,
          latestReportDate: latest.report_date,
          netPosition: latest.net_position,
          managedMoneyLong: latest.managed_money_long,
          managedMoneyShort: latest.managed_money_short,
          commercialsLong: latest.commercials_long,
          commercialsShort: latest.commercials_short,
          openInterest: latest.open_interest,
          netPercentile,
          netSignal,
          commercialDivergence,
          commercialSignal,
          oiPercentile,
        });
      }

      return results.sort((a, b) => Math.abs(a.netPosition) - Math.abs(b.netPosition) > 0 ? -1 : 1);
    },
  });
}
