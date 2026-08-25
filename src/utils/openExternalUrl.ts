import { Capacitor } from '@capacitor/core';

/**
 * Opens an external URL appropriately for the current platform: Capacitor's
 * in-app browser overlay when running natively (a plain `window.open`/
 * `<a href>` navigation would otherwise take over — or fail silently in —
 * the app's own webview), a normal new tab on web.
 *
 * Extracted from ManageSubscriptionButton, which needed this first for
 * store/portal management links; the commodity news feed needs the exact
 * same behavior for outbound article links.
 */
export const openExternalUrl = async (url: string): Promise<void> => {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};
