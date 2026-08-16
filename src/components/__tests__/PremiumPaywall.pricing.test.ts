import { describe, it, expect } from 'vitest';
import { getAnnualSavingsPct, orderWithAnnualFirst } from '../PremiumPaywall';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';

// Minimal fakes — only the fields orderWithAnnualFirst/getAnnualSavingsPct
// actually read. Cast rather than satisfying the full SDK type, which
// carries a lot of fields irrelevant here.
const pkg = (opts: {
  identifier: string;
  packageType: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  price: number;
  pricePerMonth?: number | null;
  pricePerMonthString?: string | null;
}): PurchasesPackage =>
  ({
    identifier: opts.identifier,
    packageType: opts.packageType,
    product: {
      price: opts.price,
      priceString: `$${opts.price.toFixed(2)}`,
      pricePerMonth: opts.pricePerMonth ?? null,
      pricePerMonthString: opts.pricePerMonthString ?? null,
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
