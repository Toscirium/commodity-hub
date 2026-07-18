import { useAuth } from '@/contexts/AuthContext';

/**
 * Three-tier model: All data is real-time for everyone.
 *
 * NOTE: The `isPremium` flag returned here gates the **extended catalog**
 * (extra energy markets, regional crude blends, priority refresh) and is
 * therefore wired to the **Pro** tier only. Premium-tier perks (alerts,
 * multi-portfolio, CSV) are gated separately via `useAuth().tier`.
 */
export const useDelayedData = () => {
  const auth = useAuth();
  
  // Add null check to prevent errors during initial render
  if (!auth) {
    return {
      isPremium: false,
      shouldDelayData: false, // No delay in freemium model
      getDelayedTimestamp: (timestamp?: number) => timestamp,
      getDataDelay: () => 'realtime',
      getDelayStatus: () => ({ isDelayed: false, delayText: 'Real-time', statusText: 'Live market data' })
    };
  }
  
  const { profile, isGuest } = auth;
  
  // Extended-catalog gate (Pro tier only).
  const isPremium = profile?.subscription_active && profile?.subscription_tier === 'pro';
  const shouldDelayData = false; // No delays for anyone in freemium model
  
  // No delay - return timestamp as-is
  const getDelayedTimestamp = (timestamp?: number) => timestamp;
  
  // Always return realtime for freemium model
  const getDataDelay = () => 'realtime';
  
  // Get delay status for UI display - always show as real-time
  const getDelayStatus = () => {
    return { isDelayed: false, delayText: 'Real-time', statusText: 'Live market data' };
  };
  
  return {
    isPremium,
    shouldDelayData,
    getDelayedTimestamp,
    getDataDelay,
    getDelayStatus
  };
};