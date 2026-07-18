import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLocalStorage } from './useLocalStorage';

export type CurrencyCode = 'USD' | 'EUR' | 'CNY' | 'INR';

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  name: string;
  locale: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US' },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
];

export const useCurrencyRates = () => {
  return useQuery({
    queryKey: ['currency-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('currency-rates');
      if (error) throw error;
      return data as { rates: Record<string, number>; source: string; timestamp: string };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // 10 minutes
  });
};

export const useCurrency = () => {
  const [selectedCurrency, setSelectedCurrency] = useLocalStorage<CurrencyCode>('preferred-currency', 'USD');
  const { data: ratesData, isLoading } = useCurrencyRates();

  const rates = ratesData?.rates || { USD: 1, EUR: 0.92, CNY: 7.25, INR: 83.50 };

  const convertPrice = (usdPrice: number, toCurrency?: CurrencyCode): number => {
    const target = toCurrency || selectedCurrency;
    if (target === 'USD') return usdPrice;
    return usdPrice * (rates[target] || 1);
  };

  const formatConvertedPrice = (usdPrice: number, toCurrency?: CurrencyCode, decimals: number = 2): string => {
    const target = toCurrency || selectedCurrency;
    const converted = convertPrice(usdPrice, target);
    const info = CURRENCIES.find(c => c.code === target)!;
    return new Intl.NumberFormat(info.locale, {
      style: 'currency',
      currency: target,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(converted);
  };

  const currencyInfo = CURRENCIES.find(c => c.code === selectedCurrency)!;

  return {
    selectedCurrency,
    setSelectedCurrency,
    currencyInfo,
    rates,
    convertPrice,
    formatConvertedPrice,
    isLoading,
  };
};
