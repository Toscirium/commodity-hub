import { describe, it, expect, vi } from 'vitest';
import { buildWebPlanChoices } from '../PremiumPaywall';
import { PackageType } from '@revenuecat/purchases-js';
import type { Package } from '@revenuecat/purchases-js';

// Minimal fakes — only the fields buildWebPlanChoices actually reads.
// @revenuecat/purchases-js's Package/Product shape is genuinely different
// from the native @revenuecat/purchases-capacitor one (see PremiumPaywall.tsx
// buildNativePlanChoices vs. buildWebPlanChoices), so this mirrors
// PremiumPaywall.pricing.test.ts's native fakes but with the web field paths.
const webPkg = (opts: {
  identifier: string;
  packageType: typeof PackageType.Monthly | typeof PackageType.Annual | string;
  amountMicros: number;
  formattedPrice: string;
  pricePerMonthAmountMicros?: number | null;
  pricePerMonthFormatted?: string | null;
  /** Real billing cadence, e.g. { number: 1, unit: 'year' } — only needed
   *  for the packageType-is-wrong fallback tests. */
  period?: { number: number; unit: string } | null;
}): Package =>
  ({
    identifier: opts.identifier,
    packageType: opts.packageType,
    webBillingProduct: {
      price: { amountMicros: opts.amountMicros, formattedPrice: opts.formattedPrice },
      defaultSubscriptionOption:
        opts.pricePerMonthAmountMicros != null || opts.period
          ? {
              base: {
                pricePerMonth:
                  opts.pricePerMonthAmountMicros != null
                    ? { amountMicros: opts.pricePerMonthAmountMicros, formattedPrice: opts.pricePerMonthFormatted }
                    : null,
                period: opts.period ?? null,
              },
            }
          : null,
    },
  }) as unknown as Package;

describe('buildWebPlanChoices', () => {
  it('orders annual first and computes the same % saved as the native path', () => {
    // Same $6.99/mo vs $59.99/yr ($5.00/mo equivalent) pair as the native test.
    const monthly = webPkg({
      identifier: 'm',
      packageType: PackageType.Monthly,
      amountMicros: 6_990_000,
      formattedPrice: '$6.99',
    });
    const annual = webPkg({
      identifier: 'a',
      packageType: PackageType.Annual,
      amountMicros: 59_990_000,
      formattedPrice: '$59.99',
      pricePerMonthAmountMicros: 5_000_000,
      pricePerMonthFormatted: '$5.00',
    });

    const choices = buildWebPlanChoices([monthly, annual], null, vi.fn());

    expect(choices.map((c) => c.id)).toEqual(['a', 'm']);
    const annualChoice = choices.find((c) => c.id === 'a')!;
    expect(annualChoice.isAnnual).toBe(true);
    expect(annualChoice.priceString).toBe('$59.99');
    expect(annualChoice.perMonthString).toBe('$5.00');
    expect(annualChoice.savingsPct).toBe(28); // (1 - 5.00/6.99) * 100 ≈ 28.47 → 28

    const monthlyChoice = choices.find((c) => c.id === 'm')!;
    expect(monthlyChoice.isAnnual).toBe(false);
    expect(monthlyChoice.perMonthString).toBeNull();
    expect(monthlyChoice.savingsPct).toBeNull();
  });

  it('returns null savings when there is no monthly package to compare against', () => {
    const annual = webPkg({
      identifier: 'a',
      packageType: PackageType.Annual,
      amountMicros: 59_990_000,
      formattedPrice: '$59.99',
      pricePerMonthAmountMicros: 5_000_000,
    });
    expect(buildWebPlanChoices([annual], null, vi.fn())[0].savingsPct).toBeNull();
  });

  it('returns null rather than a misleading negative/zero % if annual is not actually cheaper', () => {
    const monthly = webPkg({
      identifier: 'm',
      packageType: PackageType.Monthly,
      amountMicros: 6_990_000,
      formattedPrice: '$6.99',
    });
    const annual = webPkg({
      identifier: 'a',
      packageType: PackageType.Annual,
      amountMicros: 99_990_000,
      formattedPrice: '$99.99',
      pricePerMonthAmountMicros: 8_330_000,
    });
    const annualChoice = buildWebPlanChoices([monthly, annual], null, vi.fn()).find((c) => c.id === 'a')!;
    expect(annualChoice.savingsPct).toBeNull();
  });

  it('marks the currently-purchasing package and disables the rest', () => {
    const monthly = webPkg({
      identifier: 'm',
      packageType: PackageType.Monthly,
      amountMicros: 6_990_000,
      formattedPrice: '$6.99',
    });
    const annual = webPkg({
      identifier: 'a',
      packageType: PackageType.Annual,
      amountMicros: 59_990_000,
      formattedPrice: '$59.99',
    });
    const choices = buildWebPlanChoices([monthly, annual], 'm', vi.fn());
    const monthlyChoice = choices.find((c) => c.id === 'm')!;
    const annualChoice = choices.find((c) => c.id === 'a')!;
    expect(monthlyChoice.purchasing).toBe(true);
    expect(monthlyChoice.disabled).toBe(true);
    expect(annualChoice.purchasing).toBe(false);
    expect(annualChoice.disabled).toBe(true); // disabled globally while any purchase is in flight
  });

  it('calls onSelect with the selected package', () => {
    const onSelect = vi.fn();
    const monthly = webPkg({
      identifier: 'm',
      packageType: PackageType.Monthly,
      amountMicros: 6_990_000,
      formattedPrice: '$6.99',
    });
    const choices = buildWebPlanChoices([monthly], null, onSelect);
    choices[0].onSelect();
    expect(onSelect).toHaveBeenCalledWith(monthly);
  });
});

describe('buildWebPlanChoices — packageType misconfigured in the RC dashboard', () => {
  // Same class of bug found live on the native (Android) side: a package
  // added to the RC offering without the reserved $rc_annual identifier
  // reports a packageType that isn't PackageType.Annual. The subscription
  // option's own base.period (real cadence, from Stripe's actual price
  // config) is the fallback that still gets this right.
  const monthly = webPkg({
    identifier: 'pro_m',
    packageType: PackageType.Monthly,
    amountMicros: 20_990_000,
    formattedPrice: '€20.99',
  });
  const annualMistyped = webPkg({
    identifier: 'pro_a',
    packageType: 'custom', // <- the actual misconfiguration: not PackageType.Annual
    amountMicros: 154_990_000,
    formattedPrice: '€154.99',
    pricePerMonthAmountMicros: 12_920_000,
    pricePerMonthFormatted: '€12.92',
    period: { number: 1, unit: 'year' },
  });

  it('labels it Annual, not Monthly, via the period fallback', () => {
    const choices = buildWebPlanChoices([monthly, annualMistyped], null, vi.fn());
    const annualChoice = choices.find((c) => c.id === 'pro_a')!;
    const monthlyChoice = choices.find((c) => c.id === 'pro_m')!;
    expect(annualChoice.isAnnual).toBe(true);
    expect(annualChoice.priceString).toBe('€154.99');
    expect(annualChoice.perMonthString).toBe('€12.92');
    expect(monthlyChoice.isAnnual).toBe(false);
  });

  it('orders it first', () => {
    const choices = buildWebPlanChoices([monthly, annualMistyped], null, vi.fn());
    expect(choices.map((c) => c.id)).toEqual(['pro_a', 'pro_m']);
  });

  it('does not mistake a genuinely-unknown packageType with no year period for annual', () => {
    const trulyUnknown = webPkg({
      identifier: 'x',
      packageType: 'unknown',
      amountMicros: 1_000_000,
      formattedPrice: '$1.00',
      period: { number: 1, unit: 'week' },
    });
    const choices = buildWebPlanChoices([trulyUnknown], null, vi.fn());
    expect(choices[0].isAnnual).toBe(false);
  });
});
