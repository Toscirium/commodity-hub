import React from 'react';

export type PriceFlashDirection = 'up' | 'down' | null;

/**
 * Reports the direction of the most recent change to `value`, for the next
 * `durationMs`, then resets to null.
 *
 * Every trading product worth the name acknowledges a tick — the quote that
 * just moved briefly lights up so you can see *which* row changed without
 * diffing the screen against your memory of it. This app refreshed prices
 * silently, so a list of live quotes was indistinguishable from a screenshot
 * of one.
 *
 * Deliberately simple: prices here arrive on react-query refetch intervals
 * measured in minutes, not a sub-second stream, so this does not attempt to
 * re-trigger the animation for a second change landing inside the same
 * flash window (the class is already applied, so CSS would not replay it).
 * If this ever backs a true streaming feed, that case needs handling.
 */
export function usePriceFlash(
  value: number | null | undefined,
  durationMs = 900,
): PriceFlashDirection {
  // Seeded with the first value so mounting a list of quotes doesn't flash
  // every row at once — only an actual change after mount counts as a tick.
  const previous = React.useRef<number | null | undefined>(value);
  const [direction, setDirection] = React.useState<PriceFlashDirection>(null);

  React.useEffect(() => {
    const prev = previous.current;
    previous.current = value;

    if (typeof value !== 'number' || typeof prev !== 'number' || value === prev) {
      return;
    }

    setDirection(value > prev ? 'up' : 'down');
    const timer = window.setTimeout(() => setDirection(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [value, durationMs]);

  return direction;
}

export default usePriceFlash;
