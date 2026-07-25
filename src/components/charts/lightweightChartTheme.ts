import React from 'react';
import type { UTCTimestamp } from 'lightweight-charts';

/**
 * The app has no working theme context (next-themes is an unused dependency) —
 * dark mode is toggled by ThemeSwitcher.tsx adding/removing a `dark` class on
 * document.documentElement. lightweight-charts needs concrete color strings
 * up front, so we track that class directly.
 */
export const useIsDarkMode = (): boolean => {
  const [isDark, setIsDark] = React.useState(
    () => document.documentElement.classList.contains('dark')
  );

  React.useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setIsDark(root.classList.contains('dark'));
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark;
};

export interface LightweightChartColors {
  background: string;
  text: string;
  grid: string;
  border: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  trendlineColor: string;
  compareColor: string;
}

// Literal colors mapped from the app's HSL tokens in src/index.css — lightweight-charts
// renders to <canvas> and cannot read CSS variables, so these must be concrete values.
export const getLightweightChartColors = (isDark: boolean): LightweightChartColors => {
  if (isDark) {
    return {
      background: 'hsl(225, 7%, 5%)',
      text: 'hsl(220, 5%, 56%)',
      grid: 'hsl(225, 5%, 16%)',
      border: 'hsl(225, 5%, 16%)',
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#059669',
      wickDownColor: '#dc2626',
      trendlineColor: 'hsl(262, 83%, 58%)',
      compareColor: '#f59e0b',
    };
  }
  return {
    background: 'hsl(0, 0%, 100%)',
    text: 'hsl(220, 9%, 42%)',
    grid: 'hsl(220, 13%, 91%)',
    border: 'hsl(220, 13%, 91%)',
    upColor: '#10b981',
    downColor: '#ef4444',
    wickUpColor: '#059669',
    wickDownColor: '#dc2626',
    trendlineColor: 'hsl(262, 83%, 58%)',
    compareColor: '#f59e0b',
  };
};

export const toUtcTimestamp = (dateString: string): UTCTimestamp => {
  return (Math.floor(new Date(dateString).getTime() / 1000)) as UTCTimestamp;
};
