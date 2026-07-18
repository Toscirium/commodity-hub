import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface FirebaseConfigPlugin {
  isConfigured(): Promise<{ configured: boolean }>;
}

const FirebaseConfig = registerPlugin<FirebaseConfigPlugin>('FirebaseConfig');

/**
 * Registers the device with FCM and stores the resulting token in
 * public.device_tokens via the register-device-token edge function.
 *
 * - No-op on web (Capacitor.isNativePlatform() === false).
 * - Requires the user to be authenticated.
 * - Safe to mount once near the app root; re-runs on user change.
 */
export const usePushNotifications = () => {
  const auth = useAuth();
  const userId = auth?.user?.id;

  useEffect(() => {
    if (!userId) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    let unregister: Array<() => void> = [];

    (async () => {
      try {
        if (Capacitor.getPlatform() === 'android') {
          const { configured } = await FirebaseConfig.isConfigured();
          if (!configured || cancelled) return;
        }

        const { PushNotifications } = await import('@capacitor/push-notifications');

        const perm = await PushNotifications.checkPermissions();
        let status = perm.receive;
        if (status === 'prompt' || status === 'prompt-with-rationale') {
          const req = await PushNotifications.requestPermissions();
          status = req.receive;
        }
        if (status !== 'granted' || cancelled) return;

        const registrationHandle = await PushNotifications.addListener(
          'registration',
          async (token) => {
            try {
              const platform: 'ios' | 'android' | 'web' =
                Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
              await supabase.functions.invoke('register-device-token', {
                body: { token: token.value, platform },
              });
            } catch (err) {
              console.warn('Failed to register device token', err);
            }
          },
        );

        const errorHandle = await PushNotifications.addListener(
          'registrationError',
          (err) => console.warn('Push registration error', err),
        );

        unregister = [
          () => registrationHandle.remove(),
          () => errorHandle.remove(),
        ];

        // Wrap register() in its own try/catch so a missing/invalid
        // google-services.json (Firebase init failure) only logs a warning
        // instead of bubbling and breaking the auth bridge.
        try {
          await PushNotifications.register();
        } catch (regErr) {
          console.warn('PushNotifications.register() failed', regErr);
        }
      } catch (err) {
        console.warn('Push notifications unavailable', err);
      }
    })();

    return () => {
      cancelled = true;
      for (const fn of unregister) {
        try { fn(); } catch { /* noop */ }
      }
    };
  }, [userId]);
};