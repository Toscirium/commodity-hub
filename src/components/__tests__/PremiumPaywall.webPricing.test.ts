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
  packageType: typeof PackageType.Monthly | typeof PackageType.Annual;
  amountMicros: number;
  formattedPrice: string;
  pricePerMonthAmountMicros?: number | null;
  pricePerMonthFormatted?: string | null;
}): Package =>
  ({
    identifier: opts.identifier,
    packageType: opts.packageType,
    webBillingProduct: {
      price: { amountMicros: opts.amountMicros, formattedPrice: opts.formattedPrice },
      defaultSubscriptionOption:
        opts.pricePerMonthAmountMicros != null
          ? {
              base: {
                pricePerMonth: {
                  amountMicros: opts.pricePerMonthAmountMicros,
                  formattedPrice: opts.pricePerMonthFormatted,
                },
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
