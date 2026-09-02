import React from 'react';
import { useCommodityHistoricalData } from './useCommodityData';

export interface CommodityDerivedStats {
  /** Highest close in the trailing year, or null when there isn't a year of data. */
  weekHigh52: number | null;
  weekLow52: number | null;
  /** Where the latest close sits in the 52-week range, 0–100. */
  rangePosition: number | null;
  /** Annualised realised volatility from daily log returns, in percent. */
  realisedVol: number | null;
  isLoading: boolean;
}

const TRADING_DAYS_PER_YEAR = 252;

/**
 * 52-week range and realised volatility computed from the price history the
 * chart already fetches.
 *
 * The catalog record (`Commodity`) carries weekHigh/weekLow/volatility fields,
 * but the current provider leaves them null for most instruments — the detail
 * page's stats grid was rendering a column of em dashes. These are derivable
 * from a year of closes, which is one cached query away, so derive them and
 * treat the catalog fields as the preferred source when they're actually
 * populated (see the callers).
 *
 * Realised vol is the standard estimator: sample standard deviation of daily
 * log returns, annualised by √252. It'll read a little differently from a
 * provider's own number if theirs uses a different window or a close-to-close
 * vs Parkinson estimator — it's a reference figure, not a risk input, and the
 * Volatility Cone page is where to go for the real treatment.
 */
export const useCommodityDerivedStats = (commodityName: string): CommodityDerivedStats => {
  // An empty name is the "not resolved yet" case; useCommodityHistoricalData
  // already disables itself on a falsy name, so no request goes out.
  const { data, isLoading } = useCommodityHistoricalData(commodityName, '1y');

  return React.useMemo(() => {
    const points = data?.data ?? [];
    const prices = points.map((p) => p.price).filter((p): p is number => typeof p === 'number' && p > 0);

    if (prices.length < 2) {
      return { weekHigh52: null, weekLow52: null, rangePosition: null, realisedVol: null, isLoading };
    }

    const weekHigh52 = Math.max(...prices);
    const weekLow52 = Math.min(...prices);
    const last = prices[prices.length - 1];
    const span = weekHigh52 - weekLow52;
    const rangePosition = span > 0 ? ((last - weekLow52) / span) * 100 : null;

    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) returns.push(Math.log(prices[i] / prices[i - 1]));

    let realisedVol: number | null = null;
    if (returns.length >= 20) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      // Sample variance (n − 1): these returns are a sample of the process,
      // not the whole population.
      const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
      realisedVol = Math.sqrt(variance * TRADING_DAYS_PER_YEAR) * 100;
    }

    return { weekHigh52, weekLow52, rangePosition, realisedVol, isLoading };
  }, [data, isLoading]);
};
