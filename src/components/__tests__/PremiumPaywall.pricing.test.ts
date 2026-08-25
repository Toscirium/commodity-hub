import { describe, it, expect, vi } from 'vitest';
import { getAnnualSavingsPct, orderWithAnnualFirst, buildNativePlanChoices } from '../PremiumPaywall';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';

// Minimal fakes — only the fields orderWithAnnualFirst/getAnnualSavingsPct
// actually read. Cast rather than satisfying the full SDK type, which
// carries a lot of fields irrelevant here.
const pkg = (opts: {
  identifier: string;
  packageType: 'MONTHLY' | 'ANNUAL' | 'LIFETIME' | 'CUSTOM' | 'UNKNOWN';
  price: number;
  pricePerMonth?: number | null;
  pricePerMonthString?: string | null;
  /** ISO 8601, e.g. 'P1M' / 'P1Y' — only needed for the packageType-is-wrong fallback tests. */
  subscriptionPeriod?: string | null;
}): PurchasesPackage =>
  ({
    identifier: opts.identifier,
    packageType: opts.packageType,
    product: {
      price: opts.price,
      priceString: `$${opts.price.toFixed(2)}`,
      pricePerMonth: opts.pricePerMonth ?? null,
      pricePerMonthString: opts.pricePerMonthString ?? null,
      subscriptionPeriod: opts.subscriptionPeriod ?? null,
    },
  }) as unknown as PurchasesPackage;

describe('getAnnualSavingsPct', () => {
  it('computes the % saved vs. paying monthly all year', () => {
    // $6.99/mo monthly vs. $59.99/yr ($5.00/mo equivalent) — a realistic Premium pair.
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 6.99 });
    const annual = pkg({ identifier: 'a', packageType: 'ANNUAL', price: 59.99, pricePerMonth: 5.0 });
    // (1 - 5.00/6.99) * 100 ≈ 28.47 → rounds to 28
    expect(getAnnualSavingsPct([monthly, annual])).toBe(28);
  });

  it('returns null when there is no monthly package to compare against', () => {
    const annual = pkg({ identifier: 'a', packageType: 'ANNUAL', price: 59.99, pricePerMonth: 5.0 });
    expect(getAnnualSavingsPct([annual])).toBeNull();
  });

  it('returns null when there is no annual package', () => {
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 6.99 });
    expect(getAnnualSavingsPct([monthly])).toBeNull();
  });

  it('returns null rather than a misleading negative/zero % if annual is not actually cheaper', () => {
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 6.99 });
    const annual = pkg({ identifier: 'a', packageType: 'ANNUAL', price: 99.99, pricePerMonth: 8.33 });
    expect(getAnnualSavingsPct([monthly, annual])).toBeNull();
  });

  it('returns null when the SDK has not resolved pricePerMonth yet', () => {
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 6.99 });
    const annual = pkg({ identifier: 'a', packageType: 'ANNUAL', price: 59.99, pricePerMonth: null });
    expect(getAnnualSavingsPct([monthly, annual])).toBeNull();
  });
});

describe('packageType misconfigured in the RC dashboard (found live)', () => {
  // Real bug, found live on Pro's upgrade screen: Pro (Annual) was added to
  // the RevenueCat offering without RC's reserved $rc_annual identifier, so
  // the SDK reported its packageType as something other than 'ANNUAL'.
  // Result: both Pro options rendered labeled "Monthly" — one at €20.99,
  // one at €154.99 — with no "Save X%" badge on either, on a real payment
  // screen. subscriptionPeriod (from Play Console's actual product config,
  // independent of the package's own RC typing) is the fallback that
  // catches this. Prices/packageType value below match what was actually
  // observed.
  const monthly = pkg({ identifier: 'pro_m', packageType: 'MONTHLY', price: 20.99, subscriptionPeriod: 'P1M' });
  const annualMistyped = pkg({
    identifier: 'pro_a',
    packageType: 'CUSTOM', // <- the actual misconfiguration: not 'ANNUAL'
    price: 154.99,
    pricePerMonth: 12.92,
    pricePerMonthString: '€12.92',
    subscriptionPeriod: 'P1Y',
  });

  it('getAnnualSavingsPct still finds the annual package via subscriptionPeriod', () => {
    // (1 - 12.92/20.99) * 100 ≈ 38.4 -> 38
    expect(getAnnualSavingsPct([monthly, annualMistyped])).toBe(38);
  });

  it('orderWithAnnualFirst still puts it first', () => {
    expect(orderWithAnnualFirst([monthly, annualMistyped]).map((p) => p.identifier)).toEqual(['pro_a', 'pro_m']);
  });

  it('buildNativePlanChoices labels it Annual, not Monthly', () => {
    const choices = buildNativePlanChoices([monthly, annualMistyped], null, vi.fn());
    const annualChoice = choices.find((c) => c.id === 'pro_a')!;
    const monthlyChoice = choices.find((c) => c.id === 'pro_m')!;
    expect(annualChoice.isAnnual).toBe(true);
    expect(annualChoice.priceString).toBe('$154.99');
    expect(annualChoice.perMonthString).toBe('€12.92');
    expect(annualChoice.savingsPct).toBe(38);
    expect(monthlyChoice.isAnnual).toBe(false);
    expect(monthlyChoice.savingsPct).toBeNull();
  });

  it('does not mistake a genuinely-unknown packageType with no matching period for annual', () => {
    // Guard against the fallback being too eager: a package that's neither
    // MONTHLY nor has a P1Y period should NOT be labeled annual just because
    // it isn't 'MONTHLY'.
    const trulyUnknown = pkg({ identifier: 'x', packageType: 'UNKNOWN', price: 1, subscriptionPeriod: 'P1W' });
    const choices = buildNativePlanChoices([trulyUnknown], null, vi.fn());
    expect(choices[0].isAnnual).toBe(false);
  });

  it('parses P12M/P52W equivalent-year forms, not just literal P1Y', () => {
    // A first fix attempt string-matched subscriptionPeriod === 'P1Y' exactly
    // and still failed live, because Play can express "one year" in an
    // equivalent ISO form. durationInMonths must treat these the same.
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 20.99, subscriptionPeriod: 'P1M' });
    const annual12m = pkg({
      identifier: 'a',
      packageType: 'CUSTOM',
      price: 154.99,
      pricePerMonth: 12.92,
      subscriptionPeriod: 'P12M',
    });
    expect(orderWithAnnualFirst([monthly, annual12m]).map((p) => p.identifier)).toEqual(['a', 'm']);
    expect(buildNativePlanChoices([monthly, annual12m], null, vi.fn()).find((c) => c.id === 'a')!.isAnnual).toBe(
      true,
    );
  });

  it('falls back to price ratio when BOTH packageType and subscriptionPeriod fail to resolve', () => {
    // The scenario neither of the first two fix attempts covered: packageType
    // is neither MONTHLY nor ANNUAL for either package (dashboard
    // misconfiguration), AND subscriptionPeriod is unavailable for either
    // (SDK hasn't resolved it, or the store never sent it) — exactly the
    // "both signals absent" case this last-resort exists for. Real observed
    // prices: €20.99 vs €154.99, a >1.5x ratio.
    const cheaper = pkg({ identifier: 'pro_m', packageType: 'CUSTOM', price: 20.99, subscriptionPeriod: null });
    const pricier = pkg({ identifier: 'pro_a', packageType: 'CUSTOM', price: 154.99, subscriptionPeriod: null });

    const annualIds = orderWithAnnualFirst([cheaper, pricier]);
    expect(annualIds.map((p) => p.identifier)).toEqual(['pro_a', 'pro_m']);

    const choices = buildNativePlanChoices([cheaper, pricier], null, vi.fn());
    expect(choices.find((c) => c.id === 'pro_a')!.isAnnual).toBe(true);
    expect(choices.find((c) => c.id === 'pro_m')!.isAnnual).toBe(false);
  });

  it('does not guess from price alone when the two packages are close in price', () => {
    // Guard against the price-ratio fallback being too eager: two packages
    // priced close together (< 1.5x apart) with no resolving metadata at all
    // give no confident signal either way, so neither should be labeled
    // annual rather than picking one arbitrarily.
    const a = pkg({ identifier: 'a', packageType: 'CUSTOM', price: 20.99, subscriptionPeriod: null });
    const b = pkg({ identifier: 'b', packageType: 'CUSTOM', price: 24.99, subscriptionPeriod: null });
    const choices = buildNativePlanChoices([a, b], null, vi.fn());
    expect(choices.every((c) => !c.isAnnual)).toBe(true);
  });

  it('does not apply the price-ratio fallback to 3+ packages', () => {
    // The fallback is only well-defined for a monthly/annual pair — with 3+
    // packages "priced highest" doesn't reliably mean annual (e.g. lifetime,
    // or multiple tiers mixed into one list), so it should decline to guess.
    const a = pkg({ identifier: 'a', packageType: 'CUSTOM', price: 6.99, subscriptionPeriod: null });
    const b = pkg({ identifier: 'b', packageType: 'CUSTOM', price: 59.99, subscriptionPeriod: null });
    const c = pkg({ identifier: 'c', packageType: 'CUSTOM', price: 199.99, subscriptionPeriod: null });
    const choices = buildNativePlanChoices([a, b, c], null, vi.fn());
    expect(choices.every((choice) => !choice.isAnnual)).toBe(true);
  });
});

describe('orderWithAnnualFirst', () => {
  it('puts the annual package before monthly', () => {
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 6.99 });
    const annual = pkg({ identifier: 'a', packageType: 'ANNUAL', price: 59.99 });
    expect(orderWithAnnualFirst([monthly, annual]).map((p) => p.identifier)).toEqual(['a', 'm']);
  });

  it('is a no-op when there is only one package', () => {
    const monthly = pkg({ identifier: 'm', packageType: 'MONTHLY', price: 6.99 });
    expect(orderWithAnnualFirst([monthly]).map((p) => p.identifier)).toEqual(['m']);
  });
});
