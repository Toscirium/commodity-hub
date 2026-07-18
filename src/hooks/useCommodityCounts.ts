import { useMemo } from 'react';
import { useAvailableCommodities } from './useCommodityData';

/**
 * Returns commodity counts per group, used by CommoditySidebar across pages
 * (Dashboard, Market Status, Learning Hub, Expert Insights, Market Sentiment).
 */
export const useCommodityCounts = () => {
  const { data: commodities } = useAvailableCommodities();

  return useMemo(() => {
    const counts = {
      energy: 0,
      metals: 0,
      grains: 0,
      livestock: 0,
      dairy: 0,
      softs: 0,
      industrials: 0,
      other: 0,
    };

    if (!commodities) return counts;

    for (const c of commodities) {
      const key = (c.category as keyof typeof counts) || 'other';
      if (key in counts) counts[key] += 1;
      else counts.other += 1;
    }

    return counts;
  }, [commodities]);
};
