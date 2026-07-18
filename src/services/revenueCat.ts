import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  LOG_LEVEL,
  type PurchasesOffering,
  type CustomerInfo,
} from '@revenuecat/purchases-capacitor';
import { logger } from '@/utils/logger';
import { monitoringService } from '@/services/monitoringService';

// Public Android SDK key from RevenueCat dashboard. Safe to ship in client.
// Android key: prefer the dedicated VITE_REVENUECAT_ANDROID_KEY, fall back to
// the legacy VITE_REVENUECAT_API_KEY (which is what's currently in .env).
const REVENUECAT_ANDROID_KEY =
  (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined) ??
  (import.meta.env.VITE_REVENUECAT_API_KEY as string | undefined);
const REVENUECAT_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;

// RevenueCat entitlement identifier configured in dashboard.
export const PREMIUM_ENTITLEMENT = 'premium';

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

export const purchasePackage = async (
  pkg: PurchasesOffering['availablePackages'][number],
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> => {
  const pkgProps = {
    package_id: pkg.identifier,
    product_id: pkg.product.identifier,
    price: pkg.product.price,
    currency: pkg.product.currencyCode,
    period: pkg.packageType,
  };
  trackPurchaseEvent('purchase_started', pkgProps);
  try {
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
    const isPremium = Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]);
    trackPurchaseEvent('purchase_succeeded', {
      ...pkgProps,
      is_premium: isPremium,
    });
    return { success: isPremium, customerInfo };
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
    const restored = Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]);
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
    return Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]);
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
    const ent = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
    return ent?.productIdentifier ?? null;
  } catch {
    return null;
  }
};
