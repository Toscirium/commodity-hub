import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// Android App Links target this host (see AndroidManifest.xml's
// autoVerify="true" intent-filter + public/.well-known/assetlinks.json).
// Tapping a link to it should land on the actual page, not just relaunch
// the app to its default screen — handleAppLinkUrl below does that.
const WEB_APP_HOST = 'app.commodity-hub.eu';

/**
 * Extracts the path from a verified https://app.commodity-hub.eu/... App
 * Link and navigates the WebView there. The WebView's own origin is a local
 * Capacitor origin (not the real web domain), so this navigates by
 * path+search+hash only, not the full URL. A real page load (not a soft
 * SPA transition) — the hook that fires this (appUrlOpen / getLaunchUrl)
 * runs outside React Router's context (see NativeAuthBridge in App.tsx,
 * rendered as a sibling of <BrowserRouter>, not inside it), so there's no
 * navigate() to call here; a location change is the simplest correct
 * option and is expected anyway on the cold-start path (App.getLaunchUrl
 * fires before the SPA has mounted regardless).
 */
function handleAppLinkUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== WEB_APP_HOST) return false;
    if (typeof window === 'undefined') return true;
    const target = `${parsed.pathname}${parsed.search}${parsed.hash}` || '/';
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (target !== current) window.location.assign(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Listens for OAuth deep links (commodityhub://auth-callback) and verified
 * https://app.commodity-hub.eu App Links on native platforms. OAuth
 * callbacks complete the Supabase session (implicit and PKCE flows); App
 * Links navigate the WebView to the tapped path.
 */
export function useCapacitorAuthDeepLink() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener: (() => void) | undefined;
    const nativeOAuthPendingKey = 'auth:native-oauth-pending';

    const broadcastNativeSession = (session: Session | null) => {
      if (typeof window === 'undefined') return;

      const emit = () => {
        window.dispatchEvent(
          new CustomEvent('auth:native-session', { detail: { session } })
        );
      };

      // Emit now, then replay shortly after. On Android the deep-link hook can
      // finish before AuthProvider's effect listener has attached, especially
      // when the app is being foregrounded from Chrome Custom Tabs.
      emit();
      window.setTimeout(emit, 75);
      window.setTimeout(emit, 300);
      window.setTimeout(emit, 900);
    };

    const refreshAndBroadcastSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          localStorage.removeItem(nativeOAuthPendingKey);
          broadcastNativeSession(data.session);
          return true;
        }
      } catch (e) {
        console.warn('[OAuth] Failed to refresh native session', e);
      }
      return false;
    };

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const { Browser } = await import('@capacitor/browser');

        const closeBrowserAndRefreshSession = async () => {
          try {
            await Browser.close();
          } catch {
            /* no-op — browser may already be closed */
          }
        };

        const handleOAuthUrl = async (url?: string) => {
          if (!url) return false;
          // Match any commodityhub:// deep-link that carries an OAuth payload,
          // tolerating trailing slashes, host casing, or alternate paths.
          if (!url.toLowerCase().startsWith('commodityhub://')) return false;
          console.log('[OAuth] Received native deep link');

          // Close the in-app browser FIRST so the app WebView is foregrounded
          // and JS timers/microtasks run promptly while we finalize the session.
          await closeBrowserAndRefreshSession();

          try {
            const callbackUrl = new URL(url);
            const searchParams = callbackUrl.searchParams;
            const hashParams = new URLSearchParams(callbackUrl.hash.slice(1));
            let establishedSession: Session | null = null;

            const oauthError =
              searchParams.get('error_description') ||
              searchParams.get('error') ||
              hashParams.get('error_description') ||
              hashParams.get('error');
            if (oauthError) {
              console.error('[OAuth] Native callback returned an error:', oauthError);
              return true;
            }

            // PKCE flow — ?code=...
            const code = callbackUrl.searchParams.get('code');

            if (code) {
              console.log('[OAuth] Exchanging PKCE code for session');
              const { data, error } = await supabase.auth.exchangeCodeForSession(code);
              if (error) console.error('exchangeCodeForSession failed:', error);
              else {
                establishedSession = data.session;
                console.log('[OAuth] Session established via PKCE');
              }
            }

            // Implicit flow. The web bridge moves fragment tokens into the
            // query string for Android intents because `#Intent` consumes the
            // URL fragment before Capacitor can receive it.
            const access_token = searchParams.get('access_token') || hashParams.get('access_token');
            const refresh_token = searchParams.get('refresh_token') || hashParams.get('refresh_token');
            if (access_token && refresh_token) {
              console.log('[OAuth] Setting session via implicit tokens');
              const { data, error } = await supabase.auth.setSession({
                access_token,
                refresh_token,
              });
              if (error) console.error('setSession failed:', error);
              else establishedSession = data.session;
            }

            if (establishedSession) {
              localStorage.removeItem(nativeOAuthPendingKey);
              broadcastNativeSession(establishedSession);
            }

            window.history.replaceState({}, document.title, '/');

            // Notify the AuthProvider directly so the top-right UI updates
            // immediately, without waiting for the next onAuthStateChange tick
            // (which can be delayed by the WebView coming back to foreground).
            if (!establishedSession) {
              await refreshAndBroadcastSession();
            }
          } catch (err) {
            console.error('OAuth deep-link handling failed:', err);
          }

          return true;
        };

        const handle = await App.addListener('appUrlOpen', async ({ url }) => {
          const handledOAuth = await handleOAuthUrl(url);
          if (!handledOAuth) handleAppLinkUrl(url);
        });

        const appStateHandle = await App.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive || localStorage.getItem(nativeOAuthPendingKey) !== '1') return;
          // When Android foregrounds the WebView before appUrlOpen has flushed,
          // poll briefly so the header flips as soon as Supabase storage exists.
          for (let attempt = 0; attempt < 6; attempt++) {
            if (await refreshAndBroadcastSession()) break;
            await new Promise((resolve) => window.setTimeout(resolve, 250));
          }
        });

        const launchUrl = await App.getLaunchUrl();
        const launchWasOAuth = await handleOAuthUrl(launchUrl?.url);
        if (!launchWasOAuth) handleAppLinkUrl(launchUrl?.url);

        const browserHandle = await Browser.addListener('browserFinished', async () => {
          await closeBrowserAndRefreshSession();
          if (localStorage.getItem(nativeOAuthPendingKey) === '1') {
            await refreshAndBroadcastSession();
          }
        });

        removeListener = () => {
          handle.remove();
          appStateHandle.remove();
          browserHandle.remove();
        };
      } catch (err) {
        console.warn('Capacitor deep-link listener not registered:', err);
      }
    })();

    return () => {
      removeListener?.();
    };
  }, []);
}