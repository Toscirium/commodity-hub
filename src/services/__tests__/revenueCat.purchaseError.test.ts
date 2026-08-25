import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real bug, found live: upgrading Premium -> Pro, the user backed out of
// the Play Billing sheet (an ordinary cancellation), but the app showed a
// "Purchase failed" toast instead of silently doing nothing. Root cause:
// purchasePackage's cancellation check only read err.userCancelled, which
// RevenueCat's own types mark deprecated in favor of checking err.code
// directly — and the product-change flow's cancellation didn't set the
// deprecated field, so it fell through to the generic failure branch.
const purchasePackageMock = vi.fn();
vi.mock('@revenuecat/purchases-capacitor', () => ({
  Purchases: { purchasePackage: purchasePackageMock },
  LOG_LEVEL: { WARN: 'WARN' },
  PRORATION_MODE: {
    IMMEDIATE_AND_CHARGE_PRORATED_PRICE: 2,
    IMMEDIATE_WITH_TIME_PRORATION: 1,
  },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1' },
}));

const trackUserEvent = vi.fn();
vi.mock('@/services/monitoringService', () => ({
  monitoringService: { trackUserEvent: (...args: unknown[]) => trackUserEvent(...args) },
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const fakePkg = {
  identifier: 'pro_monthly_pkg',
  packageType: 'MONTHLY',
  product: { identifier: 'premium_monthly', price: 19.99, currencyCode: 'USD' },
} as any;

describe('purchasePackage — cancellation detection', () => {
  beforeEach(() => {
    purchasePackageMock.mockReset();
    trackUserEvent.mockReset();
  });

  it('treats err.code === PURCHASE_CANCELLED_ERROR as a cancellation, not a failure', async () => {
    // The actual shape observed live: no userCancelled flag set, only code.
    purchasePackageMock.mockRejectedValue({ code: '1', message: 'Purchase was cancelled.' });
    const { purchasePackage } = await import('../revenueCat');

    const result = await purchasePackage(fakePkg);

    expect(result).toEqual({ success: false, error: 'cancelled' });
    expect(trackUserEvent).toHaveBeenCalledWith('purchase_cancelled', expect.any(Object));
    expect(trackUserEvent).not.toHaveBeenCalledWith('purchase_failed', expect.anything());
  });

  it('still honors the deprecated userCancelled flag for backward compatibility', async () => {
    purchasePackageMock.mockRejectedValue({ userCancelled: true, code: '0' });
    const { purchasePackage } = await import('../revenueCat');

    const result = await purchasePackage(fakePkg);

    expect(result).toEqual({ success: false, error: 'cancelled' });
    expect(trackUserEvent).not.toHaveBeenCalledWith('purchase_failed', expect.anything());
  });

  it('still reports a genuine error as a failure, not a cancellation', async () => {
    purchasePackageMock.mockRejectedValue({ code: '2', message: 'Store problem' });
    const { purchasePackage } = await import('../revenueCat');

    const result = await purchasePackage(fakePkg);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Store problem');
    expect(trackUserEvent).toHaveBeenCalledWith('purchase_failed', expect.any(Object));
    expect(trackUserEvent).not.toHaveBeenCalledWith('purchase_cancelled', expect.anything());
  });
});
