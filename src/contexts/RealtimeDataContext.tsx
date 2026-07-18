import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { CommodityPrice, useAvailableCommodities } from '@/hooks/useCommodityData';
import { useDelayedData } from '@/hooks/useDelayedData';

interface RealtimeDataContextType {
  prices: Record<string, CommodityPrice>;
  connected: boolean;
  error: string | null;
  lastUpdate: Date | null;
  getPriceForCommodity: (commodityName: string) => CommodityPrice | null;
  isLiveData: (commodityName: string) => boolean;
  isDelayedData: boolean;
  delayStatus: {
    isDelayed: boolean;
    delayText: string;
    statusText: string;
  };
}

const RealtimeDataContext = createContext<RealtimeDataContextType | undefined>(undefined);

const defaultRealtimeDataContext: RealtimeDataContextType = {
  prices: {},
  connected: false,
  error: null,
  lastUpdate: null,
  getPriceForCommodity: () => null,
  isLiveData: () => false,
  isDelayedData: false,
  delayStatus: {
    isDelayed: false,
    delayText: 'Real-time',
    statusText: 'Live market data',
  },
};

export const useRealtimeDataContext = () => {
  const context = useContext(RealtimeDataContext);
  if (context === undefined) {
    // Fall back to safe defaults instead of throwing so a transient
    // provider unmount (HMR, error boundary recovery) doesn't blank the UI.
    if (typeof console !== 'undefined') {
      console.warn('useRealtimeDataContext used outside RealtimeDataProvider — using defaults');
    }
    return defaultRealtimeDataContext;
  }
  return context;
};

export const RealtimeDataProvider = ({ children }: { children: ReactNode }) => {
  const { data: commodities } = useAvailableCommodities();
  const { shouldDelayData, isPremium, getDelayStatus } = useDelayedData();
  const delayStatus = getDelayStatus();
  
  // For now, use empty prices object since we removed CommodityPriceAPI
  const prices = React.useMemo(() => {
    const convertedPrices: Record<string, CommodityPrice> = {};
    
    // Return empty prices for now - could integrate with FMP API directly here in the future
    if (commodities) {
      commodities.forEach(commodity => {
        convertedPrices[commodity.name] = {
          price: commodity.price,
          change: commodity.change,
          changePercent: commodity.changePercent,
          timestamp: new Date().toISOString()
        };
      });
    }
    return convertedPrices;
  }, [commodities]);

  const getPriceForCommodity = (commodityName: string): CommodityPrice | null => {
    return prices[commodityName] || null;
  };

  const isLiveData = (commodityName: string): boolean => {
    return !shouldDelayData && prices[commodityName] !== undefined;
  };

  const value = {
    prices,
    connected: !shouldDelayData,
    error: null,
    lastUpdate: new Date(),
    getPriceForCommodity,
    isLiveData,
    isDelayedData: shouldDelayData,
    delayStatus
  };

  return (
    <RealtimeDataContext.Provider value={value}>
      {children}
    </RealtimeDataContext.Provider>
  );
};