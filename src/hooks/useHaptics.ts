
import React from 'react';

interface UseHapticsOptions {
  enabled?: boolean;
}

export const useHaptics = (options: UseHapticsOptions = {}) => {
  const { enabled = true } = options;

  const vibrate = React.useCallback(async (type: 'light' | 'medium' | 'heavy' | 'selection' = 'light') => {
    if (!enabled) return;

    try {
      // Check if we're in a Capacitor environment
      if (typeof window !== 'undefined' && (window as any).Capacitor) {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        
        const styles = {
          light: ImpactStyle.Light,
          medium: ImpactStyle.Medium,
          heavy: ImpactStyle.Heavy,
        };

        if (type === 'selection') {
          await Haptics.selectionStart();
          await Haptics.selectionChanged();
          await Haptics.selectionEnd();
        } else {
          await Haptics.impact({ style: styles[type] });
        }
      } else if ('vibrate' in navigator) {
        // Fallback to web vibration API
        const durations = {
          light: 10,
          medium: 20,
          heavy: 50,
          selection: 5,
        };
        
        navigator.vibrate(durations[type]);
      }
    } catch (error) {
      console.log('Haptics not available:', error);
    }
  }, [enabled]);

  const vibrateSuccess = React.useCallback(() => vibrate('medium'), [vibrate]);
  const vibrateError = React.useCallback(() => vibrate('heavy'), [vibrate]);
  const vibrateSelection = React.useCallback(() => vibrate('selection'), [vibrate]);
  const vibrateTouch = React.useCallback(() => vibrate('light'), [vibrate]);

  return {
    vibrate,
    vibrateSuccess,
    vibrateError,
    vibrateSelection,
    vibrateTouch,
  };
};
