import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { identifyUser, resetAnalytics, trackPageview } from '@/lib/analytics';

/**
 * Sends a pageview on every route change and ties the session to the signed-in
 * account. Renders nothing. Must sit inside both BrowserRouter (for
 * useLocation) and AuthProvider.
 *
 * No-ops entirely when VITE_POSTHOG_KEY is unset.
 */
const AnalyticsBridge = () => {
  const location = useLocation();
  const auth = useAuth();
  const userId = auth?.user?.id ?? null;
  const identified = useRef<string | null>(null);

  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    if (userId && identified.current !== userId) {
      identified.current = userId;
      // Tier, not email — enough to segment replays by plan without shipping
      // an address into a third party.
      identifyUser(userId, { tier: auth?.profile?.subscription_tier ?? 'free' });
    } else if (!userId && identified.current) {
      // Signed out: drop the association so the next person on this device
      // isn't recorded as the previous one.
      identified.current = null;
      resetAnalytics();
    }
  }, [userId, auth?.profile?.subscription_tier]);

  return null;
};

export default AnalyticsBridge;
