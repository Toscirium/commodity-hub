import { describe, it, expect } from 'vitest'
import { black76, normCdf, normPdf, impliedVol, daysToT } from '@/utils/blackScholes'

// Reference values below were computed independently in Python using
// math.erf (not the repo's Abramowitz-Stegun normCdf approximation), so
// they verify the formulas themselves rather than just re-deriving the
// same approximation. The ATM case is also the classic Black-76 example
// from Haug's "Complete Guide to Option Pricing Formulas" (F=K=19,
// T=0.75, r=0.10, sigma=0.28 -> call/put ~= 1.70).

describe('normCdf / normPdf', () => {
  it('matches known standard-normal values', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6)
    expect(normPdf(0)).toBeCloseTo(0.3989422804, 6)
    expect(normCdf(-5)).toBeCloseTo(0, 6)
    expect(normCdf(5)).toBeCloseTo(1, 6)
  })
})

describe('black76', () => {
  it('prices the Haug ATM futures-option example (call)', () => {
    const g = black76({ F: 19, K: 19, T: 0.75, r: 0.10, sigma: 0.28, type: 'call' })
    expect(g.price).toBeCloseTo(1.70105073, 4)
    expect(g.delta).toBeCloseTo(0.50863624, 4)
    expect(g.gamma).toBeCloseTo(0.07974503, 4)
    expect(g.vega).toBeCloseTo(0.06045471, 4)
    expect(g.theta).toBeCloseTo(-0.00262571, 4)
    expect(g.rho).toBeCloseTo(-1.27578804, 4)
  })

  it('prices the Haug ATM futures-option example (put) and matches call by parity', () => {
    const call = black76({ F: 19, K: 19, T: 0.75, r: 0.10, sigma: 0.28, type: 'call' })
    const put = black76({ F: 19, K: 19, T: 0.75, r: 0.10, sigma: 0.28, type: 'put' })
    // F == K, so disc*(F-K) == 0 and put-call parity collapses to put == call.
    expect(put.price).toBeCloseTo(call.price, 8)
    expect(put.price).toBeCloseTo(1.70105073, 4)
    expect(put.delta).toBeCloseTo(-0.41910725, 4)
    expect(put.gamma).toBeCloseTo(0.07974503, 4)
    expect(put.rho).toBeCloseTo(-1.27578804, 4)
  })

  it('prices an in-the-money call / out-of-the-money put off the same inputs', () => {
    const call = black76({ F: 100, K: 90, T: 0.5, r: 0.05, sigma: 0.25, type: 'call' })
    expect(call.price).toBeCloseTo(12.52410934, 4)
    expect(call.delta).toBeCloseTo(0.73454284, 4)
    expect(call.gamma).toBeCloseTo(0.0174147, 4)
    expect(call.vega).toBeCloseTo(0.21768373, 4)
    expect(call.rho).toBeCloseTo(-6.26205467, 4)

    const put = black76({ F: 100, K: 90, T: 0.5, r: 0.05, sigma: 0.25, type: 'put' })
    expect(put.price).toBeCloseTo(2.77101022, 4)
    expect(put.delta).toBeCloseTo(-0.24076707, 4)
    expect(put.gamma).toBeCloseTo(0.0174147, 4)
    expect(put.theta).toBeCloseTo(-0.01453025, 4)
    expect(put.rho).toBeCloseTo(-1.38550511, 4)
  })

  it('prices a short-dated, high-vol out-of-the-money call', () => {
    const g = black76({ F: 50, K: 55, T: 1 / 12, r: 0.03, sigma: 0.60, type: 'call' })
    expect(g.price).toBeCloseTo(1.65229801, 4)
    expect(g.delta).toBeCloseTo(0.32063912, 4)
    expect(g.theta).toBeCloseTo(-0.05074204, 4)
  })

  it('falls back to discounted intrinsic value at T=0', () => {
    const call = black76({ F: 100, K: 90, T: 0, r: 0.05, sigma: 0.25, type: 'call' })
    expect(call.price).toBeCloseTo(10, 8)
    expect(call.delta).toBe(0)
    expect(call.gamma).toBe(0)
    expect(call.vega).toBe(0)

    const put = black76({ F: 90, K: 100, T: 0, r: 0.05, sigma: 0.25, type: 'put' })
    expect(put.price).toBeCloseTo(10, 8)
  })

  it('falls back to discounted intrinsic value at sigma=0', () => {
    const call = black76({ F: 100, K: 90, T: 0.5, r: 0.05, sigma: 0, type: 'call' })
    expect(call.price).toBeCloseTo(9.753099120283327, 8)
  })

  it('falls back to discounted intrinsic value for a non-positive futures price', () => {
    const put = black76({ F: 0, K: 90, T: 0.5, r: 0.05, sigma: 0.25, type: 'put' })
    expect(put.price).toBeCloseTo(87.77789208254994, 6)

    const call = black76({ F: 0, K: 90, T: 0.5, r: 0.05, sigma: 0.25, type: 'call' })
    expect(call.price).toBe(0)
  })
})

describe('impliedVol', () => {
  it('recovers the volatility used to generate the price (call)', () => {
    const trueSigma = 0.35
    const F = 75, K = 80, T = 0.4, r = 0.04
    const marketPrice = black76({ F, K, T, r, sigma: trueSigma, type: 'call' }).price
    const solved = impliedVol(marketPrice, F, K, T, r, 'call')
    expect(solved).not.toBeNull()
    expect(solved as number).toBeCloseTo(trueSigma, 3)
  })

  it('recovers the volatility used to generate the price (put, deep ITM)', () => {
    const trueSigma = 0.22
    const F = 60, K = 90, T = 0.6, r = 0.02
    const marketPrice = black76({ F, K, T, r, sigma: trueSigma, type: 'put' }).price
    const solved = impliedVol(marketPrice, F, K, T, r, 'put')
    expect(solved).not.toBeNull()
    expect(solved as number).toBeCloseTo(trueSigma, 3)
  })

  it('returns null when the market price is below intrinsic value', () => {
    // Deep ITM call: intrinsic alone is already ~20, so a price of 1 is impossible.
    const solved = impliedVol(1, 120, 100, 0.5, 0.05, 'call')
    expect(solved).toBeNull()
  })

  it('returns null for non-positive inputs', () => {
    expect(impliedVol(5, 0, 100, 0.5, 0.05, 'call')).toBeNull()
    expect(impliedVol(5, 100, 100, 0, 0.05, 'call')).toBeNull()
    expect(impliedVol(0, 100, 100, 0.5, 0.05, 'call')).toBeNull()
  })
})

describe('daysToT', () => {
  it('converts calendar days to years using a 365-day year', () => {
    expect(daysToT(365)).toBe(1)
    expect(daysToT(30)).toBeCloseTo(30 / 365, 10)
  })

  it('clamps negative days to zero', () => {
    expect(daysToT(-10)).toBe(0)
  })
})
