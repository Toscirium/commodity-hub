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
  /** Muted, trend-neutral — for the period-start reference line, distinct from the live price line's up/down color. */
  referenceLineColor: string;
}

// Same monospace family the rest of the app uses for every other number on
// screen (see tailwind.config.ts `fontFamily.mono` / .number-display in
// index.css) — lightweight-charts draws its own axis/price labels on
// <canvas>, so it never picked this up from CSS and looked subtly
// mismatched next to every other price in the UI.
export const CHART_FONT_FAMILY = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';

// Literal colors mapped from the app's HSL tokens in src/index.css — lightweight-charts
// renders to <canvas> and cannot read CSS variables, so these must be concrete values.
export const getLightweightChartColors = (isDark: boolean): LightweightChartColors => {
  if (isDark) {
    return {
      background: 'hsl(225, 7%, 5%)',
      text: 'hsl(220, 5%, 56%)',
      // Was 11pp lighter than the background (hsl(...,16%) vs bg's 5%) — a
      // fairly bold grid. Webull's is barely-there dotted lines; 5pp is much
      // closer to that while still being findable.
      grid: 'hsl(225, 5%, 10%)',
      border: 'hsl(225, 5%, 16%)',
      upColor: '#10b981',
      downColor: '#ef4444',
      wickUpColor: '#059669',
      wickDownColor: '#dc2626',
      trendlineColor: 'hsl(262, 83%, 58%)',
      compareColor: '#f59e0b',
      referenceLineColor: 'hsl(220, 5%, 56%)',
    };
  }
  return {
    background: 'hsl(0, 0%, 100%)',
    text: 'hsl(220, 9%, 42%)',
    // Same rationale as above, mirrored for a light background: was 9pp
    // darker than white, now 5pp.
    grid: 'hsl(220, 13%, 95%)',
    border: 'hsl(220, 13%, 91%)',
    upColor: '#10b981',
    downColor: '#ef4444',
    wickUpColor: '#059669',
    wickDownColor: '#dc2626',
    trendlineColor: 'hsl(262, 83%, 58%)',
    compareColor: '#f59e0b',
    referenceLineColor: 'hsl(220, 9%, 42%)',
  };
};

export const toUtcTimestamp = (dateString: string): UTCTimestamp => {
  return (Math.floor(new Date(dateString).getTime() / 1000)) as UTCTimestamp;
};
