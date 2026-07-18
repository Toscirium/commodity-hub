
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRetry } from '@/hooks/useRetry';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useDelayedData } from './useDelayedData';
import { useCacheOptimization } from './useCacheOptimization';

export interface CommodityPriceData {
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface CommodityPrice {
  price: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

export interface Commodity {
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  venue: string;
  contractSize?: string;
  category: string;
  // Enhanced fields for Market Screener - can be null if not available
  volume: number | null;
  volumeDisplay: string | null;
  weekHigh: number | null;
  weekLow: number | null;
  volatility: number | null;
  beta: string | null;
  avgVolume: number | null;
  marketCap: string | null;
}

interface FetchCommoditySymbolsResponse {
  commodities?: Commodity[];
}

export const useAvailableCommodities = (options?: { lightweight?: boolean }) => {
  const { getDataDelay, shouldDelayData, isPremium } = useDelayedData();
  const { getOptimizedQuerySettings } = useCacheOptimization();
  
  // Get optimized settings for commodity data
  const optimizedSettings = getOptimizedQuerySettings('price');

  // Lightweight mode: re-use whatever's in cache, never poll, long stale time.
  // Used by pages that only need a snapshot (e.g. Market Screener) to avoid
  // burning CommodityPriceAPI quota on background refetches.
  const lightweightOverrides = options?.lightweight
    ? {
        refetchInterval: false as const,
        refetchOnMount: false as const,
        refetchOnWindowFocus: false,
        staleTime: 30 * 60 * 1000, // 30 min
      }
    : {};
  
  return useQuery({
    queryKey: ['all-commodities', getDataDelay(), isPremium],
    queryFn: async (): Promise<Commodity[]> => {
      try {
        const { data, error } = await supabase.functions.invoke<FetchCommoditySymbolsResponse>(
          'fetch-commodity-symbols',
          { body: { dataDelay: getDataDelay() } },
        );

        if (error) {
          console.warn('Failed to fetch commodities:', error);
          throw new Error(error.message);
        }

        return data?.commodities || [];
      } catch (error) {
        console.warn('Error fetching commodities:', error);
        throw error;
      }
    },
    ...optimizedSettings,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches on mobile
    refetchOnReconnect: 'always', // But refetch when connection restored
    ...lightweightOverrides,
  });
};

export interface CommodityHistoricalData {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

// Add a specific interface for candlestick data
export interface CandlestickData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  price: number; // Keep for compatibility
}

interface RawCommodityPrice {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  lastUpdate: string;
}

interface FetchCommodityPricesResponse {
  price: RawCommodityPrice | null;
  source: string;
  commodity: string;
  symbol?: string;
  realTime: boolean;
  dataDelay: 'realtime' | '15min';
  isDelayed: boolean;
  cached?: boolean;
}

export const useCommodityPrice = (commodityName: string) => {
  const { getDataDelay, shouldDelayData, isPremium } = useDelayedData();
  const { getOptimizedQuerySettings } = useCacheOptimization();
  
  // Get optimized settings for price data
  const optimizedSettings = getOptimizedQuerySettings('price');
  
  return useQuery({
    queryKey: ['commodity-price', commodityName, getDataDelay(), isPremium],
    queryFn: async (): Promise<CommodityPriceData | null> => {
      try {
        const { data, error } = await supabase.functions.invoke<FetchCommodityPricesResponse>(
          'fetch-commodity-prices',
          {
            body: {
              commodityName,
              dataDelay: getDataDelay(),
              isPremium
            }
          },
        );

        if (error) {
          console.warn(`Failed to fetch price for ${commodityName}:`, error);
          return null;
        }

        if (!data?.price) return null;
        return {
          price: data.price.price,
          change: data.price.change,
          changePercent: data.price.changePercent,
          timestamp: data.price.lastUpdate,
        };
      } catch (error) {
        console.warn(`Error fetching price for ${commodityName}:`, error);
        return null;
      }
    },
    ...optimizedSettings,
  });
};

interface RawHistoricalPoint {
  date: string;
  price?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
}

interface FetchCommodityDataResponse {
  data?: RawHistoricalPoint[];
  source: string;
  ohlcAvailable: boolean;
  commodity: string;
  symbol: string;
  realTime: boolean;
  dataPoints: number;
  chartType: string;
  dataDelay: 'realtime' | '15min';
  isDelayed: boolean;
  cached?: boolean;
}

export const useCommodityHistoricalData = (commodityName: string, timeframe: string, chartType: string = 'line', contractSymbol?: string) => {
  const auth = useAuth();
  const { getDataDelay, shouldDelayData } = useDelayedData();
  const { getOptimizedQuerySettings } = useCacheOptimization();
  
  // Handle case where auth is not yet available
  const profile = auth?.profile || null;
  
  // Get optimized settings for historical data
  const optimizedSettings = getOptimizedQuerySettings('historical');
  
  // Debug logging to see what contract symbol is being passed
  console.log(`useCommodityHistoricalData called for ${commodityName} with contract: ${contractSymbol}`);
  
  return useQuery({
    queryKey: ['commodity-historical', commodityName, timeframe, chartType, contractSymbol, getDataDelay()],
    queryFn: async (): Promise<{ data: CommodityHistoricalData[], loading: boolean, error: string | null, ohlcAvailable: boolean }> => {
      try {
        const isPremium = profile?.subscription_active && profile?.subscription_tier === 'premium';
        
        console.log(`Fetching commodity data for ${commodityName} with contract symbol: ${contractSymbol}`);
        
        const { data, error } = await supabase.functions.invoke<FetchCommodityDataResponse>(
          'fetch-commodity-data',
          {
            body: {
              commodityName,
              timeframe,
              isPremium,
              chartType,
              dataDelay: getDataDelay(),
              contractSymbol
            }
          },
        );

        if (error) {
          console.warn(`Failed to fetch historical data for ${commodityName}:`, error);
          return { data: [], loading: false, error: error.message, ohlcAvailable: false };
        }

        console.log(`Raw API response for ${commodityName} (${chartType}):`, data);

        const ohlcAvailable = !!data?.ohlcAvailable;

        // Ensure OHLC data is properly structured for candlestick charts
        const processedData: CommodityHistoricalData[] = data?.data?.map((item) => {
          if (chartType === 'candlestick' && ohlcAvailable && typeof item.open === 'number') {
            return {
              date: item.date,
              price: item.close ?? item.price ?? 0,
              open: item.open,
              high: item.high,
              low: item.low,
              close: item.close
            };
          } else {
            return {
              date: item.date,
              price: item.price ?? 0
            };
          }
        }) || [];

        console.log(`Processed data for ${commodityName} (${chartType}):`, processedData.slice(0, 2));

        return { 
          data: processedData, 
          loading: false, 
          error: null,
          ohlcAvailable,
        };
      } catch (error) {
        console.warn(`Error fetching historical data for ${commodityName}:`, error);
        return { 
          data: [], 
          loading: false, 
          error: error instanceof Error ? error.message : 'Unknown error',
          ohlcAvailable: false,
        };
      }
    },
    ...optimizedSettings,
  });
};
