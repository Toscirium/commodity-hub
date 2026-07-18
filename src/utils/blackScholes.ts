// Black-Scholes-Merton pricing, Greeks, and implied-vol solver for
// options on futures (Black-76 formulation, which is what CME uses for
// commodity options settlements).
//
// All inputs use continuous-compounding annualized units:
//   F : futures price (underlying)
//   K : strike
//   T : time to expiry in years (calendar/365)
//   r : risk-free rate (annualized, decimal)
//   sigma : implied volatility (annualized, decimal)
//
// Black-76 differs from equity BS only by discounting the futures price
// as if it were a forward: d1 uses F not S*exp(r*T).

export type OptionType = 'call' | 'put';

/** Standard normal CDF via error function approximation (Abramowitz–Stegun 7.1.26). */
export function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Standard normal PDF. */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export interface BSInputs {
  F: number; K: number; T: number; r: number; sigma: number; type: OptionType;
}

export interface Greeks {
  price: number;
  delta: number;   // per $1 move in F
  gamma: number;   // per $1 move in F
  vega: number;    // per 1 vol point (i.e., 0.01 shift); divided by 100
  theta: number;   // per calendar day
  rho: number;     // per 1% rate shift
}

/** Black-76 price + Greeks for an option on a future. */
export function black76(inputs: BSInputs): Greeks {
  const { F, K, T, r, sigma, type } = inputs;
  if (!(F > 0) || !(K > 0) || !(T > 0) || !(sigma > 0)) {
    // Return intrinsic-only at boundary conditions
    const intr = type === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0);
    const disc = Math.exp(-r * Math.max(T, 0));
    return { price: disc * intr, delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const nd1 = normPdf(d1);

  let price: number;
  let delta: number;
  let rho: number;
  if (type === 'call') {
    price = disc * (F * Nd1 - K * Nd2);
    delta = disc * Nd1;
    rho = -T * price;
  } else {
    price = disc * (K * normCdf(-d2) - F * normCdf(-d1));
    delta = -disc * normCdf(-d1);
    rho = -T * price;
  }
  const gamma = (disc * nd1) / (F * sigma * sqrtT);
  const vega = (F * disc * nd1 * sqrtT) / 100;                  // per 1 vol pt
  // Theta = -∂price/∂T; per-day = /365.
  const commonTheta = -(F * disc * nd1 * sigma) / (2 * sqrtT);
  let theta: number;
  if (type === 'call') {
    theta = (commonTheta + r * disc * F * Nd1 - r * disc * K * Nd2) / 365;
  } else {
    theta = (commonTheta - r * disc * F * normCdf(-d1) + r * disc * K * normCdf(-d2)) / 365;
  }
  return { price, delta, gamma, vega, theta, rho };
}

/**
 * Solve for implied vol given a market premium.
 * Newton–Raphson with a bisection safety net. Returns null when the price is
 * below intrinsic or the solver fails to converge.
 */
export function impliedVol(
  marketPrice: number,
  F: number, K: number, T: number, r: number, type: OptionType,
): number | null {
  if (!(marketPrice > 0) || !(F > 0) || !(K > 0) || !(T > 0)) return null;
  const disc = Math.exp(-r * T);
  const intrinsic = disc * (type === 'call' ? Math.max(F - K, 0) : Math.max(K - F, 0));
  if (marketPrice < intrinsic - 1e-6) return null;
  // Initial guess: Brenner–Subrahmanyam ATM approximation.
  let sigma = Math.max(0.05, Math.sqrt(2 * Math.PI / T) * marketPrice / F);
  for (let i = 0; i < 60; i++) {
    const g = black76({ F, K, T, r, sigma, type });
    const diff = g.price - marketPrice;
    if (Math.abs(diff) < 1e-6) return sigma;
    const vegaRaw = g.vega * 100; // undo the /100 scaling for solving
    if (!(vegaRaw > 1e-8)) break;
    let next = sigma - diff / vegaRaw;
    if (!Number.isFinite(next) || next <= 0 || next > 5) {
      next = sigma * (diff > 0 ? 0.5 : 1.5);
    }
    sigma = next;
  }
  // Bisection fallback in [1e-4, 5]
  let lo = 1e-4, hi = 5;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    const p = black76({ F, K, T, r, sigma: mid, type }).price;
    if (Math.abs(p - marketPrice) < 1e-5) return mid;
    if (p > marketPrice) hi = mid; else lo = mid;
  }
  return null;
}

/** Convert calendar days to years for BS T. */
export function daysToT(days: number): number {
  return Math.max(days, 0) / 365;
}