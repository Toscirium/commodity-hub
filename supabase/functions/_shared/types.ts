// Shared types for edge functions
export type CorsHeaders = Record<string, string>;

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface LogContext {
  functionName: string;
  userId?: string;
  requestId?: string;
}

export interface CommoditySymbol {
  symbol: string;
  category: string;
  contractSize: string;
  venue: string;
  /**
   * Data freshness tier surfaced to the UI as a badge:
   * - 'live'      : minute/hour fresh from a real exchange feed (default)
   * - 'eod'       : daily settlement only — Platts/Argus-style daily quote
   * - 'reference' : weekly reference price, no intraday signal
   */
  dataFreshness?: 'live' | 'eod' | 'reference';
}

export interface CommodityData {
  name: string;
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  lastUpdate: string;
  category: string;
  contractSize?: string;
  venue?: string;
}

export interface StripeSubscription {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  canceled_at?: number;
  current_period_end: number;
  customer: string;
}

export interface UserProfile {
  id: string;
  email: string;
  subscription_active: boolean;
  subscription_tier: string;
  stripe_customer_id?: string;
}