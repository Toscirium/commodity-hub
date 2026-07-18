import { Capacitor } from '@capacitor/core';

/**
 * Hook to detect the current platform (web, iOS, Android)
 * Used to determine native vs web platform behaviour.
 */
export const usePlatform = () => {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform() as 'web' | 'ios' | 'android';
  const isAndroid = platform === 'android';
  const isIOS = platform === 'ios';
  const isWeb = platform === 'web';

  return { 
    isNative, 
    platform, 
    isAndroid, 
    isIOS, 
    isWeb 
  };
};

export default usePlatform;
