import { describe, it, expect } from 'vitest'
import { tierFromProfile, tierAtLeast, limitsFor, tierForProductId, TIER_LIMITS, TIER_PRICING, type Tier } from '@/utils/tiers'

describe('tierFromProfile', () => {
  it('returns free when the subscription is not active, regardless of tier field', () => {
    expect(tierFromProfile(false, 'pro')).toBe('free')
    expect(tierFromProfile(null, 'premium')).toBe('free')
    expect(tierFromProfile(undefined, 'pro')).toBe('free')
  })

  it('returns free when active but the tier field is missing or unrecognized', () => {
    expect(tierFromProfile(true, null)).toBe('free')
    expect(tierFromProfile(true, undefined)).toBe('free')
    expect(tierFromProfile(true, 'free')).toBe('free')
    expect(tierFromProfile(true, 'gold')).toBe('free')
  })

  it('maps active + tier field to premium/pro', () => {
    expect(tierFromProfile(true, 'premium')).toBe('premium')
    expect(tierFromProfile(true, 'pro')).toBe('pro')
  })

  it('is case-sensitive: an unexpected casing does not silently grant access', () => {
    // Documents current behavior. If this ever starts failing because someone
    // "fixed" it to be case-insensitive, that's a deliberate product decision,
    // not a regression to shrug off.
    expect(tierFromProfile(true, 'Pro')).toBe('free')
    expect(tierFromProfile(true, 'PREMIUM')).toBe('free')
  })
})

describe('tierAtLeast', () => {
  it('orders tiers free < premium < pro', () => {
    expect(tierAtLeast('free', 'free')).toBe(true)
    expect(tierAtLeast('free', 'premium')).toBe(false)
    expect(tierAtLeast('free', 'pro')).toBe(false)

    expect(tierAtLeast('premium', 'free')).toBe(true)
    expect(tierAtLeast('premium', 'premium')).toBe(true)
    expect(tierAtLeast('premium', 'pro')).toBe(false)

    expect(tierAtLeast('pro', 'free')).toBe(true)
    expect(tierAtLeast('pro', 'premium')).toBe(true)
    expect(tierAtLeast('pro', 'pro')).toBe(true)
  })
})

describe('limitsFor', () => {
  it('returns the exact TIER_LIMITS entry for each tier', () => {
    const tiers: Tier[] = ['free', 'premium', 'pro']
    for (const tier of tiers) {
      expect(limitsFor(tier)).toBe(TIER_LIMITS[tier])
    }
  })

  it('free tier is the most restrictive baseline', () => {
    const free = limitsFor('free')
    expect(free.csvExport).toBe(false)
    expect(free.extendedCatalog).toBe(false)
    expect(free.forwardCurves).toBe(false)
    expect(free.cotReports).toBe(false)
    expect(free.customSpreads).toBe(false)
    expect(free.alertTypes).toEqual(['price'])
  })

  it('pro tier unlocks every gated feature and has no numeric caps', () => {
    const pro = limitsFor('pro')
    expect(pro.csvExport).toBe(true)
    expect(pro.extendedCatalog).toBe(true)
    expect(pro.forwardCurves).toBe(true)
    expect(pro.cotReports).toBe(true)
    expect(pro.customSpreads).toBe(true)
    expect(pro.portfolios).toBe(Number.POSITIVE_INFINITY)
    expect(pro.watchlists).toBe(Number.POSITIVE_INFINITY)
    expect(pro.watchlistItems).toBe(Number.POSITIVE_INFINITY)
    expect(pro.spreadPresets).toBe(Number.POSITIVE_INFINITY)
  })

  it('limits monotonically increase (or stay equal) from free -> premium -> pro', () => {
    const free = limitsFor('free')
    const premium = limitsFor('premium')
    const pro = limitsFor('pro')

    expect(premium.activeAlerts).toBeGreaterThanOrEqual(free.activeAlerts)
    expect(pro.activeAlerts).toBeGreaterThanOrEqual(premium.activeAlerts)

    expect(premium.portfolios).toBeGreaterThanOrEqual(free.portfolios)
    expect(pro.portfolios).toBeGreaterThanOrEqual(premium.portfolios)

    expect(premium.watchlists).toBeGreaterThanOrEqual(free.watchlists)
    expect(pro.watchlists).toBeGreaterThanOrEqual(premium.watchlists)

    expect(premium.alertTypes.length).toBeGreaterThanOrEqual(free.alertTypes.length)
    expect(pro.alertTypes.length).toBeGreaterThanOrEqual(premium.alertTypes.length)
  })
})

describe('tierForProductId', () => {
  // Getting this backwards mis-classifies an upgrade as a downgrade, which
  // picks the wrong Play Store proration mode and bills the customer wrong —
  // see buildProductChangeInfo in src/services/revenueCat.ts.
  it('maps the real Play Store product ids to their tier', () => {
    expect(tierForProductId('premium_lite_monthly')).toBe('premium')
    expect(tierForProductId('premium_lite_annual')).toBe('premium')
    expect(tierForProductId('premium_monthly')).toBe('pro')
    expect(tierForProductId('premium_annual')).toBe('pro')
  })

  it('stays in sync with the product ids TIER_PRICING actually ships', () => {
    expect(tierForProductId(TIER_PRICING.premium.productId)).toBe('premium')
    expect(tierForProductId(TIER_PRICING.pro.productId)).toBe('pro')
  })

  it("is not fooled by Pro's id being a prefix of Premium's", () => {
    // 'premium_monthly' (Pro) is a shorter prefix than 'premium_lite_monthly'
    // (Premium), so a naive startsWith('premium') check reads every Premium
    // product as Pro.
    expect(tierForProductId('premium_lite_monthly')).not.toBe(tierForProductId('premium_monthly'))
  })

  it('tolerates the :basePlanId suffix Play sometimes appends', () => {
    expect(tierForProductId('premium_lite_annual:annual')).toBe('premium')
    expect(tierForProductId('premium_annual:annual')).toBe('pro')
  })
})
