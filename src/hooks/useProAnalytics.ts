import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function invokePro<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session?.access_token) throw new Error('Authentication required');
  const { data, error } = await supabase.functions.invoke('pro-analytics', {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  return data as T;
}

export interface SeasonalityMonth {
  month: number;
  avgReturn: number;
  hitRate: number;
  years: number;
  min: number;
  max: number;
}

export interface SeasonalityResponse {
  commodity: string;
  label: string;
  months: SeasonalityMonth[];
  yearsCovered: number;
  asOf: string;
  cached?: boolean;
}

export const useSeasonality = (commodity: string | null) =>
  useQuery({
    queryKey: ['pro-analytics', 'seasonality', commodity],
    enabled: Boolean(commodity),
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: () => invokePro<SeasonalityResponse>({ route: 'seasonality', commodity }),
  });

export interface SpreadRow {
  id: string;
  label: string;
  unit?: string;
  note?: string;
  current?: number;
  avg20?: number;
  mean1y?: number;
  std1y?: number;
  zScore?: number;
  tag?: 'rich' | 'cheap' | 'neutral';
  spark?: number[];
  asOf?: string;
  error?: string;
}

export interface SpreadsResponse {
  generatedAt: string;
  rows: SpreadRow[];
  cached?: boolean;
}

export const useSpreadMonitor = (enabled: boolean) =>
  useQuery({
    queryKey: ['pro-analytics', 'spreads'],
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: () => invokePro<SpreadsResponse>({ route: 'spreads' }),
  });

export interface RegimeRow {
  commodity: string;
  label: string;
  price?: number;
  trend: 'up' | 'down' | 'sideways';
  vol: 'low' | 'normal' | 'high';
  volAnnualized?: number;
  return60d?: number;
  return20d?: number;
  error?: string;
}
export interface RegimeResponse {
  generatedAt: string;
  rows: RegimeRow[];
  cached?: boolean;
}
export const useRegime = (enabled: boolean) =>
  useQuery({
    queryKey: ['pro-analytics', 'regime'],
    enabled,
    staleTime: 6 * 60 * 60 * 1000,
    queryFn: () => invokePro<RegimeResponse>({ route: 'regime' }),
  });

export interface PortfolioAnalyticsResponse {
  positions?: number;
  currentValue?: number;
  var95Daily?: number;
  var95Pct?: number;
  maxDrawdownPct?: number;
  volAnnualizedPct?: number;
  sharpe?: number | null;
  beta?: number | null;
  history?: { date: string; value: number }[];
  error?: string;
}
export const usePortfolioAnalytics = (enabled: boolean) =>
  useQuery({
    queryKey: ['pro-analytics', 'portfolio-analytics'],
    enabled,
    staleTime: 15 * 60 * 1000,
    queryFn: () => invokePro<PortfolioAnalyticsResponse>({ route: 'portfolio_analytics' }),
  });

export interface BacktestResponse {
  commodity: string;
  label: string;
  monthsLong: number[];
  yearsCovered: number;
  totalReturnPct: number;
  cagrPct: number;
  buyHoldReturnPct: number;
  maxDrawdownPct: number;
  sharpe: number | null;
  hitRate: number;
  trades: number;
  equityCurve: { date: string; equity: number }[];
}
export const useBacktest = (params: { commodity: string; monthsLong: number[]; years: number } | null) =>
  useQuery({
    queryKey: ['pro-analytics', 'backtest', params],
    enabled: Boolean(params),
    staleTime: 60 * 60 * 1000,
    queryFn: () => invokePro<BacktestResponse>({ route: 'backtest', ...params! }),
  });

export const PRO_ANALYTICS_PRODUCTS = [
  { id: 'wti',      label: 'WTI Crude' },
  { id: 'brent',    label: 'Brent Crude' },
  { id: 'natgas',   label: 'Natural Gas' },
  { id: 'rbob',     label: 'RBOB Gasoline' },
  { id: 'heating',  label: 'Heating Oil' },
  { id: 'gold',     label: 'Gold' },
  { id: 'silver',   label: 'Silver' },
  { id: 'copper',   label: 'Copper' },
  { id: 'platinum', label: 'Platinum' },
  { id: 'palladium',label: 'Palladium' },
  { id: 'corn',     label: 'Corn' },
  { id: 'wheat',    label: 'Wheat' },
  { id: 'soybeans', label: 'Soybeans' },
  { id: 'cattle',   label: 'Live Cattle' },
  { id: 'hogs',     label: 'Lean Hogs' },
];