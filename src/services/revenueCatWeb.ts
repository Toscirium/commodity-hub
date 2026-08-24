// RevenueCat Web Billing (browser) client — the counterpart to revenueCat.ts,
// which only ever runs inside the native app (see isRevenueCatAvailable()
// there gating on Capacitor.isNativePlatform()). This file is mostly the
// web-only purchase path: same entitlements ('premium'/'pro'), same
// Supabase-backed webhook (supabase/functions/revenuecat-webhook — RC's
// event schema is provider-agnostic, so Web Billing purchases land on the
// exact same handler with no backend changes), different SDK because RC
// ships a dedicated browser SDK (@revenuecat/purchases-js) with its own
// types — Package/Product here are NOT the same shapes as
// @revenuecat/purchases-capacitor's.
//
// One deliberate exception: configureRevenueCatWeb()/getWebManagementUrl()
// are reachable from native too (see ManageSubscriptionButton.tsx) — a
// user who subscribed via web still needs their Stripe portal link when
// opening "Manage subscription" from the Android app. Only *starting a new
// purchase* stays native-excluded (isRevenueCatWebAvailable()), since that
// has to go through Google Play Billing on Android, not Stripe.
//
// @revenuecat/purchases-js bundles its own checkout UI and is large (it
// roughly quadrupled the main app chunk when imported statically — verified
// with a real build). Every function below dynamically imports it instead,
// so it's only fetched when actually invoked — on native, that means only
// on the (rare) path above, not on every load of PremiumPaywall.tsx /
// ManageSubscriptionButton.tsx, which both statically import this file.
import { Capacitor } from '@capacitor/core';
import type { Purchases, Offering, Package, CustomerInfo } from '@revenuecat/purchases-js';
import { logger } from '@/utils/logger';
import { monitoringService } from '@/services/monitoringService';
import { PREMIUM_ENTITLEMENT, PRO_ENTITLEMENT } from '@/services/revenueCat';

// Public Web Billing API key from the RevenueCat dashboard (Project settings
// → API keys → Web Billing app). Public/publishable by design — same
// "safe to ship in client" status as the Android key — so it's fine in
// import.meta.env same as the others.
const REVENUECAT_WEB_KEY = import.meta.env.VITE_REVENUECAT_WEB_KEY as string | undefined;

let instance: Purchases | null = null;
let configuredFor: string | null = null;

const getActivePaidEntitlement = (customerInfo: CustomerInfo) =>
  customerInfo.entitlements.active[PRO_ENTITLEMENT] ??
  customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] ??
  null;

const trackPurchaseEvent = (event: string, props: Record<string, unknown>) => {
  try {
    monitoringService.trackUserEvent(event, props);
  } catch (err) {
    logger.warn('Failed to track purchase event', err);
  }
};

/**
 * Whether a new Web Billing *purchase* can be started here. Deliberately
 * native-excluded: checkout has to go through Google Play Billing on
 * Android, not Stripe, and RC's checkout UI isn't meant to render inside a
 * Capacitor WebView. Gates PremiumPaywall's web purchase flow.
 */
export const isRevenueCatWebAvailable = (): boolean =>
  !Capacitor.isNativePlatform() && Boolean(REVENUECAT_WEB_KEY);

/**
 * Whether the Web Billing SDK can be configured at all — just checks the
 * key exists, on any platform. Read-only lookups (getCustomerInfo() for
 * "Manage subscription") are harmless from inside the native app: a user
 * who subscribed on web still needs their Stripe portal link even when
 * they're now opening this from the Android app. Only *purchasing* needs
 * the stricter isRevenueCatWebAvailable() above.
 */
export const isRevenueCatWebKeyConfigured = (): boolean => Boolean(REVENUECAT_WEB_KEY);

/**
 * Configures (or re-targets) the Web Billing SDK for the given signed-in
 * user. Safe to call on every paywall open: a no-op if already configured
 * for this exact user, and cleanly re-configures if the signed-in user
 * changed (sign-out/sign-in in the same tab, no page reload).
 */
export const configureRevenueCatWeb = async (appUserId: string): Promise<boolean> => {
  if (!isRevenueCatWebKeyConfigured()) return false;
  if (configuredFor === appUserId && instance) return true;
  try {
    const { Purchases, LogLevel } = await import('@revenuecat/purchases-js');
    Purchases.setLogLevel(LogLevel.Warn);
    instance = Purchases.configure({ apiKey: REVENUECAT_WEB_KEY!, appUserId });
    configuredFor = appUserId;
    return true;
  } catch (err) {
    logger.error('RevenueCat Web configure failed', err);
    instance = null;
    configuredFor = null;
    return false;
  }
};

/** Clears the configured instance so the next configure() call starts clean. */
export const logoutRevenueCatWebUser = (): void => {
  instance = null;
  configuredFor = null;
};

export const getWebOfferings = async (): Promise<Offering | null> => {
  if (!instance) return null;
  try {
    const { current } = await instance.getOfferings();
    return current ?? null;
  } catch (err) {
    logger.error('RevenueCat Web getOfferings failed', err);
    return null;
  }
};

export const purchaseWebPackage = async (
  pkg: Package,
  context: Record<string, unknown> = {},
): Promise<{ success: boolean; customerInfo?: CustomerInfo; error?: string }> => {
  const pkgProps = {
    package_id: pkg.identifier,
    product_id: pkg.webBillingProduct.identifier,
    price: pkg.webBillingProduct.price.amountMicros / 1_000_000,
    currency: pkg.webBillingProduct.price.currency,
    period: pkg.packageType,
    ...context,
  };
  trackPurchaseEvent('purchase_started', pkgProps);
  if (!instance) {
    trackPurchaseEvent('purchase_failed', { ...pkgProps, error_code: 'not_configured', error_message: 'Not configured' });
    return { success: false, error: 'Not signed in yet — try again in a moment.' };
  }
  try {
    // .purchase() renders RC's own checkout UI (a modal, by default) and
    // resolves once the purchase completes.
    const { customerInfo } = await instance.purchase({ rcPackage: pkg });
    const activeEntitlement = getActivePaidEntitlement(customerInfo);
    trackPurchaseEvent('purchase_succeeded', {
      ...pkgProps,
      entitlement: activeEntitlement?.identifier ?? null,
    });
    return { success: Boolean(activeEntitlement), customerInfo };
  } catch (err) {
    const { PurchasesError, ErrorCode } = await import('@revenuecat/purchases-js');
    const rcError = err instanceof PurchasesError ? err : null;
    if (rcError?.errorCode === ErrorCode.UserCancelledError) {
      trackPurchaseEvent('purchase_cancelled', pkgProps);
      return { success: false, error: 'cancelled' };
    }
    const message = rcError?.message ?? (err instanceof Error ? err.message : 'Purchase failed');
    trackPurchaseEvent('purchase_failed', {
      ...pkgProps,
      error_code: rcError?.errorCode ?? 'unknown',
      error_message: message,
    });
    logger.error('RevenueCat Web purchase failed', err);
    return { success: false, error: message };
  }
};

/**
 * URL to RC's hosted "manage subscription" page for the current web
 * customer, if they have an active Web Billing subscription. Mirrors
 * getActiveProductId() on the native side, which instead deep-links into
 * the Play Store / App Store subscription screen.
 */
export const getWebManagementUrl = async (): Promise<string | null> => {
  if (!instance) return null;
  try {
    const info = await instance.getCustomerInfo();
    return info.managementURL;
  } catch {
    return null;
  }
};
