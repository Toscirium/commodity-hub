import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Listens for OAuth deep links (commodityhub://auth-callback) on native
 * platforms and completes the Supabase session. Supports both implicit
 * (#access_token=...) and PKCE (?code=...) callback shapes.
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
          await handleOAuthUrl(url);
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
        await handleOAuthUrl(launchUrl?.url);

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