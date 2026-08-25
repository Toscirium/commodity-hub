import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  LOG_LEVEL,
  PRORATION_MODE,
  type GoogleProductChangeInfo,
  type PurchasesOffering,
  type CustomerInfo,
} from '@revenuecat/purchases-capacitor';
import { logger } from '@/utils/logger';
import { monitoringService } from '@/services/monitoringService';
import { tierForProductId } from '@/utils/tiers';

// Public Android SDK key from RevenueCat dashboard. Safe to ship in client.
// Android key: prefer the dedicated VITE_REVENUECAT_ANDROID_KEY, fall back to
// the legacy VITE_REVENUECAT_API_KEY (which is what's currently in .env).
const REVENUECAT_ANDROID_KEY =
  (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined) ??
  (import.meta.env.VITE_REVENUECAT_API_KEY as string | undefined);
const REVENUECAT_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;

// RevenueCat entitlement identifier configured in dashboard.
export const PREMIUM_ENTITLEMENT = 'premium';
export const PRO_ENTITLEMENT = 'pro';

const getActivePaidEntitlement = (customerInfo: CustomerInfo) =>
  customerInfo.entitlements.active[PRO_ENTITLEMENT] ??
  customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] ??
  null;

let configured = false;

const trackPurchaseEvent = (event: string, props: Record<string, unknown>) => {
  try {
    monitoringService.trackUserEvent(event, props);
  } catch (err) {
    logger.warn('Failed to track purchase event', err);
  }
};

export const isRevenueCatAvailable = (): boolean => {
  if (!Capacitor.isNativePlatform()) return false;
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return Boolean(REVENUECAT_ANDROID_KEY);
  if (platform === 'ios') return Boolean(REVENUECAT_IOS_KEY);
  return false;
};

export const configureRevenueCat = async (appUserId: string | null): Promise<void> => {
  if (!isRevenueCatAvailable() || configured) return;

  const platform = Capacitor.getPlatform();
  const apiKey = platform === 'ios' ? REVENUECAT_IOS_KEY! : REVENUECAT_ANDROID_KEY!;

  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey, appUserID: appUserId ?? undefined });
    configured = true;
  } catch (err) {
    logger.error('RevenueCat configure failed', err);
  }
};

export const identifyRevenueCatUser = async (userId: string): Promise<void> => {
  if (!configured) return;
  try {
    await Purchases.logIn({ appUserID: userId });
  } catch (err) {
    logger.error('RevenueCat logIn failed', err);
  }
};

export const logoutRevenueCatUser = async (): Promise<void> => {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    logger.warn('RevenueCat logOut failed', err);
  }
};

export const getOfferings = async (): Promise<PurchasesOffering | null> => {
  if (!configured) return null;
  try {
    const { current } = await Purchases.getOfferings();
    return current ?? null;
  } catch (err) {
    logger.error('RevenueCat getOfferings failed', err);
    return null;
  }
};

/**
 * Play Store product ids sometimes arrive as `subId:basePlanId`. Google's
 * upgrade/downgrade flow wants the bare subscription id — passing the
 * combined form silently fails to match the existing purchase.
 */
const bareProductId = (id: string): string => id.split(':')[0];

/**
 * Tells Google Play that this purchase REPLACES the caller's current
 * subscription instead of being an additional one.
 *
 * Premium and Pro are separate subscription products here (each with its own
 * base plan), not two base plans of one product — and Play has no iOS-style
 * subscription groups to infer a swap from. So without an explicit old
 * product id, buying Pro while subscribed to Premium opens a SECOND
 * subscription and bills for both.
 *
 * Android-only: googleProductChangeInfo is ignored on other platforms, and
 * on web RC's Billing portal handles plan changes instead (there's no
 * product-change equivalent in the web SDK — see PremiumPaywall, which sends
 * web subscribers to the portal rather than into a fresh checkout).
 */
const buildProductChangeInfo = async (
  nextProductId: string,
): Promise<GoogleProductChangeInfo | null> => {
  if (Capacitor.getPlatform() !== 'android') return null;

  const currentRaw = await getActiveProductId();
  if (!currentRaw) return null; // no existing subscription — ordinary purchase

  const current = bareProductId(currentRaw);
  const next = bareProductId(nextProductId);
  if (current === next) return null; // same product (e.g. re-purchase): not a change

  // Charging the prorated difference immediately is only valid for an
  // upgrade; for anything else (downgrade, or a duration switch within the
  // same tier) credit the unused time instead, which Play accepts in both
  // directions.
  const isUpgrade =
    tierForProductId(current) === 'premium' && tierForProductId(next) === 'pro';

  return {
    oldProductIdentifier: current,
    prorationMode: isUpgrade
      ? PRORATION_MODE.IMMEDIATE_AND_CHARGE_PRORATED_PRICE
      : PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION,
  };
};

export const purchasePackage = async (
  pkg: PurchasesOffering['availablePackages'][number],
  context: Record<string, unknown> = {},
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> => {
  const pkgProps = {
    package_id: pkg.identifier,
    product_id: pkg.product.identifier,
    price: pkg.product.price,
    currency: pkg.product.currencyCode,
    period: pkg.packageType,
    ...context,
  };
  trackPurchaseEvent('purchase_started', pkgProps);
  try {
    const googleProductChangeInfo = await buildProductChangeInfo(pkg.product.identifier);
    const { customerInfo } = await Purchases.purchasePackage({
      aPackage: pkg,
      ...(googleProductChangeInfo && { googleProductChangeInfo }),
    });
    const activeEntitlement = getActivePaidEntitlement(customerInfo);
    trackPurchaseEvent('purchase_succeeded', {
      ...pkgProps,
      entitlement: activeEntitlement?.identifier ?? null,
    });
    return { success: Boolean(activeEntitlement), customerInfo };
  } catch (err: any) {
    if (err?.userCancelled) {
      trackPurchaseEvent('purchase_cancelled', pkgProps);
      return { success: false, error: 'cancelled' };
    }
    trackPurchaseEvent('purchase_failed', {
      ...pkgProps,
      error_code: err?.code ?? 'unknown',
      error_message: err?.message ?? 'Purchase failed',
    });
    logger.error('RevenueCat purchase failed', err);
    return { success: false, error: err?.message ?? 'Purchase failed' };
  }
};

export const restorePurchases = async (): Promise<boolean> => {
  if (!configured) return false;
  trackPurchaseEvent('restore_attempted', {});
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const restored = Boolean(getActivePaidEntitlement(customerInfo));
    trackPurchaseEvent(restored ? 'restore_succeeded' : 'restore_failed', {
      reason: restored ? 'ok' : 'no_active_entitlement',
    });
    return restored;
  } catch (err) {
    trackPurchaseEvent('restore_failed', { reason: 'exception' });
    logger.error('RevenueCat restore failed', err);
    return false;
  }
};

export const hasActivePremium = async (): Promise<boolean> => {
  if (!configured) return false;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return Boolean(getActivePaidEntitlement(customerInfo));
  } catch {
    return false;
  }
};

/**
 * Returns the product identifier of the currently active premium entitlement,
 * if any. Used to deep-link the user to the right Play Store subscription
 * management screen.
 */
export const getActiveProductId = async (): Promise<string | null> => {
  if (!configured) return null;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const ent = getActivePaidEntitlement(customerInfo);
    return ent?.productIdentifier ?? null;
  } catch {
    return null;
  }
};
