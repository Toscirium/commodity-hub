// Shared statistics helpers for backtest-style edge functions (pro-analytics'
// seasonality backtest and run-strategy-backtest's custom-strategy backtest).
// Kept deliberately generic — each caller decides what a "period return"
// means for its own strategy shape (monthly % return for the seasonality
// rule; per-bar P&L in spread points for the pairs sandbox, since a spread
// can cross zero and percentage returns aren't well-defined there).

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Max drawdown (negative fraction, e.g. -0.23) from a running equity/level curve. */
export function maxDrawdown(curve: number[]): number {
  let peak = curve.length ? curve[0] : 0;
  let maxDd = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    if (peak !== 0) {
      const dd = (v - peak) / Math.abs(peak);
      if (dd < maxDd) maxDd = dd;
    }
  }
  return maxDd;
}

/** Max drawdown in absolute units (not a fraction) — for series that can cross zero. */
export function maxDrawdownAbsolute(curve: number[]): number {
  let peak = curve.length ? curve[0] : 0;
  let maxDd = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = v - peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}

/** Annualized Sharpe ratio (no risk-free adjustment) from a series of period returns/P&L. */
export function annualizedSharpe(periodReturns: number[], periodsPerYear: number): number | null {
  if (periodReturns.length < 2) return null;
  const sd = stdev(periodReturns);
  if (sd <= 0) return null;
  return (mean(periodReturns) / sd) * Math.sqrt(periodsPerYear);
}
