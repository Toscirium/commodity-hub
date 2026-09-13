// Shared time-series alignment helpers for multi-commodity spread/pair math.
// Extracted from pro-analytics (used by its Spreads route) so
// run-strategy-backtest can align a two-leg pair the same way instead of
// duplicating this logic.

export type Bar = { date: string; close: number };

/** Weighted sum of N legs on their common dates (spread = sum(weight * price)). */
export function mergeSeries(
  legs: { series: Bar[]; weight: number }[],
): { date: string; value: number }[] {
  if (!legs.length) return [];
  const dateSets = legs.map((l) => new Set(l.series.map((r) => r.date)));
  const commonDates = [...dateSets[0]].filter((d) => dateSets.every((s) => s.has(d))).sort();
  const lookups = legs.map((l) => new Map(l.series.map((r) => [r.date, r.close] as const)));
  const out: { date: string; value: number }[] = [];
  for (const d of commonDates) {
    let val = 0;
    for (let i = 0; i < legs.length; i++) val += legs[i].weight * (lookups[i].get(d) ?? 0);
    out.push({ date: d, value: val });
  }
  return out;
}

/** num / den on their common dates (only where den != 0). */
export function ratioSeries(num: Bar[], den: Bar[]): { date: string; value: number }[] {
  const dNum = new Map(num.map((r) => [r.date, r.close] as const));
  const dDen = new Map(den.map((r) => [r.date, r.close] as const));
  const out: { date: string; value: number }[] = [];
  for (const [date, n] of dNum) {
    const d = dDen.get(date);
    if (d && d !== 0) out.push({ date, value: n / d });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Align two raw legs on their common dates, keeping both closes separately
 * (rather than collapsing to one weighted value) — the shape a user strategy
 * needs to decide its own long/short logic per leg.
 */
export function alignPair(
  legA: Bar[],
  legB: Bar[],
): { date: string; a: number; b: number }[] {
  const mapB = new Map(legB.map((r) => [r.date, r.close] as const));
  const out: { date: string; a: number; b: number }[] = [];
  for (const rowA of legA) {
    const b = mapB.get(rowA.date);
    if (b != null && rowA.close != null) out.push({ date: rowA.date, a: rowA.close, b });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}
