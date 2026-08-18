// Canonical store links for the app. Single source of truth so the
// package ID can't drift out of sync between call sites (it did once —
// see git history for PremiumPaywall.tsx / PlayStoreOptimizations.tsx).
//
// Must match `applicationId` in android/app/build.gradle.
export const PLAY_STORE_PACKAGE_ID = 'app.lovable.c8fabd7a96c74aff8d7b001690ec23c7';

export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE_ID}`;
