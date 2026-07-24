import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/**
 * Listens for OAuth deep links (commodityhub://auth-callback) forwarded by
 * the Tauri shell (src-tauri/) and completes the Supabase session. Mirrors
 * useCapacitorAuthDeepLink's PKCE/implicit callback handling — see that hook
 * for the mobile equivalent. No-ops outside the desktop shell.
 */
export function useDesktopAuthDeepLink() {
  useEffect(() => {
    const desktopApi = window.desktop;
    if (!desktopApi?.isDesktop) return;

    const handleDeepLink = async (url: string) => {
      if (!url || !url.toLowerCase().startsWith('commodityhub://')) return;

      try {
        const callbackUrl = new URL(url);
        const searchParams = callbackUrl.searchParams;
        const hashParams = new URLSearchParams(callbackUrl.hash.slice(1));

        const oauthError =
          searchParams.get('error_description') ||
          searchParams.get('error') ||
          hashParams.get('error_description') ||
          hashParams.get('error');
        if (oauthError) {
          console.error('[OAuth] Desktop callback returned an error:', oauthError);
          window.dispatchEvent(new CustomEvent('auth:error', { detail: { message: oauthError } }));
          return;
        }

        let establishedSession: Session | null = null;

        // PKCE flow — ?code=...
        const code = searchParams.get('code');
        if (code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error('exchangeCodeForSession failed:', error);
          else establishedSession = data.session;
        }

        // Implicit flow — #access_token=...
        const access_token = searchParams.get('access_token') || hashParams.get('access_token');
        const refresh_token = searchParams.get('refresh_token') || hashParams.get('refresh_token');
        if (!establishedSession && access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) console.error('setSession failed:', error);
          else establishedSession = data.session;
        }

        if (establishedSession) {
          window.dispatchEvent(
            new CustomEvent('auth:native-session', { detail: { session: establishedSession } })
          );
        }
      } catch (err) {
        console.error('OAuth deep-link handling failed:', err);
      }
    };

    return desktopApi.onAuthDeepLink(handleDeepLink);
  }, []);
}
