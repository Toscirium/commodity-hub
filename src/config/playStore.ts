/**
 * Single source of truth for the Play Store package/links. This existed as
 * three independent hardcoded copies before (PremiumPaywall.tsx,
 * ManageSubscriptionButton.tsx, PlayStoreOptimizations.tsx) — two of them
 * had drifted to a stale package ID from before a rename and were silently
 * broken. Import from here instead of hardcoding the URL again.
 *
 * Must match android/app/build.gradle's applicationId.
 */
export const ANDROID_PACKAGE_NAME = 'app.lovable.c8fabd7a96c74aff8d7b001690ec23c7';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`;

/** Deep-links to a specific subscription in Play Store's subscription management page. */
export const buildPlayStoreManageSubscriptionUrl = (productId: string | null): string => {
  const base = 'https://play.google.com/store/account/subscriptions';
  if (!productId) return base;
  return `${base}?sku=${encodeURIComponent(productId)}&package=${ANDROID_PACKAGE_NAME}`;
};
