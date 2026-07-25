import React from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

export interface TrendlinePoint {
  time: UTCTimestamp;
  price: number;
}

export interface Trendline {
  id: string;
  p1: TrendlinePoint;
  p2: TrendlinePoint;
  color?: string;
}

type TrendlinesBySymbol = Record<string, Trendline[]>;

const STORAGE_PREFIX = 'trendlines:';

const loadFromStorage = (commodityName: string): Trendline[] => {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + commodityName);
    return raw ? (JSON.parse(raw) as Trendline[]) : [];
  } catch {
    return [];
  }
};

const saveToStorage = (commodityName: string, trendlines: Trendline[]) => {
  try {
    localStorage.setItem(STORAGE_PREFIX + commodityName, JSON.stringify(trendlines));
  } catch {
    // localStorage unavailable (private browsing, quota) — trendlines just stay in-memory for this session.
  }
};

/**
 * Session-scoped trendline storage, keyed by commodity symbol so switching charts
 * doesn't leak lines across commodities. Persisted to localStorage as a convenience
 * (survives refresh) — not synced to any backend.
 */
export const useTrendlines = (commodityName: string) => {
  const [bySymbol, setBySymbol] = React.useState<TrendlinesBySymbol>(() => ({
    [commodityName]: loadFromStorage(commodityName),
  }));
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setBySymbol((prev) => {
      if (prev[commodityName]) return prev;
      return { ...prev, [commodityName]: loadFromStorage(commodityName) };
    });
    setSelectedId(null);
  }, [commodityName]);

  const trendlines = bySymbol[commodityName] ?? [];

  const addTrendline = React.useCallback((p1: TrendlinePoint, p2: TrendlinePoint, color?: string) => {
    const trendline: Trendline = { id: crypto.randomUUID(), p1, p2, color };
    setBySymbol((prev) => {
      const next = [...(prev[commodityName] ?? []), trendline];
      saveToStorage(commodityName, next);
      return { ...prev, [commodityName]: next };
    });
    return trendline.id;
  }, [commodityName]);

  const removeTrendline = React.useCallback((id: string) => {
    setBySymbol((prev) => {
      const next = (prev[commodityName] ?? []).filter((t) => t.id !== id);
      saveToStorage(commodityName, next);
      return { ...prev, [commodityName]: next };
    });
    setSelectedId((prev) => (prev === id ? null : prev));
  }, [commodityName]);

  const clearTrendlines = React.useCallback(() => {
    setBySymbol((prev) => {
      saveToStorage(commodityName, []);
      return { ...prev, [commodityName]: [] };
    });
    setSelectedId(null);
  }, [commodityName]);

  return {
    trendlines,
    addTrendline,
    removeTrendline,
    clearTrendlines,
    selectedId,
    setSelectedId,
  };
};
