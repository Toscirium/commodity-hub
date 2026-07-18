import React from 'react';
import { formatPrice } from '@/lib/commodityUtils';
import { CommodityPriceData } from '@/hooks/useCommodityData';

interface ChartFooterProps {
  name: string;
  selectedTimeframe: string;
  loading: boolean;
  error: string | null;
  isPositiveTrend: boolean;
  displayPrice: number;
  isPremium: boolean;
  currentPrice?: CommodityPriceData | null;
}

const ChartFooter: React.FC<ChartFooterProps> = ({
  name,
  selectedTimeframe,
  loading,
  error,
  isPositiveTrend,
  displayPrice,
  isPremium,
  currentPrice
}) => {
  return null; // Removed market status and price information
};

export default ChartFooter;