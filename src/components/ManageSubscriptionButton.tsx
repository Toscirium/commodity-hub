import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button, type ButtonProps } from '@/components/ui/button';
import { getActiveProductId, isRevenueCatAvailable } from '@/services/revenueCat';
import { configureRevenueCatWeb, getWebManagementUrl, isRevenueCatWebKeyConfigured } from '@/services/revenueCatWeb';
import { buildPlayStoreManageSubscriptionUrl } from '@/config/playStore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const IOS_MANAGE_URL = 'itms-apps://apps.apple.com/account/subscriptions';
const APPLE_ACCOUNT_WEB_URL = 'https://apps.apple.com/account/subscriptions';

interface ManageSubscriptionButtonProps extends Omit<ButtonProps, 'onClick'> {
  label?: string;
}

const ManageSubscriptionButton: React.FC<ManageSubscriptionButtonProps> = ({
  label = 'Manage subscription',
  variant = 'outline',
  size = 'sm',
  className,
  ...rest
}) => {
  const [busy, setBusy] = React.useState(false);
  const auth = useAuth();
  const { toast } = useToast();

  const openUrl = async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleClick = async () => {
    setBusy(true);
    try {
      // Route by where the subscription actually lives (profiles.
      // subscription_store, set by revenuecat-webhook from event.store),
      // NOT by which platform this button happens to be clicked from — a
      // web/Stripe purchase should still open the Stripe portal even when
      // opened from inside the Android app, and vice versa. See the
      // "Manage subscription opens the wrong place" conversation this fixed.
      const store = auth?.profile?.subscription_store;
      const isPaid = (auth?.tier ?? 'free') !== 'free';

      if (store === 'RC_BILLING' || store === 'STRIPE') {
        if (isRevenueCatWebKeyConfigured() && auth?.user?.id) {
          await configureRevenueCatWeb(auth.user.id);
          const url = await getWebManagementUrl();
          if (url) {
            await openUrl(url);
            return;
          }
        }
      } else if (store === 'APP_STORE' || store === 'MAC_APP_STORE') {
        // itms-apps:// only resolves on an actual iOS device; anywhere else
        // (Android, web/desktop), fall back to Apple's own web account page.
        await openUrl(Capacitor.getPlatform() === 'ios' ? IOS_MANAGE_URL : APPLE_ACCOUNT_WEB_URL);
        return;
      } else if (isPaid) {
        // store === 'PLAY_STORE', or a legacy row from before this column
        // existed — every subscriber was Android-only back then, so Play
        // Store's generic subscriptions page (always valid, even with no
        // product-specific SKU) is a safe default for a paying customer.
        const productId = isRevenueCatAvailable() ? await getActiveProductId() : null;
        await openUrl(buildPlayStoreManageSubscriptionUrl(productId));
        return;
      }

      // Not an error — this button renders for every signed-in user
      // regardless of tier (see UserProfile/AccountSettings), and most
      // people clicking it simply aren't subscribed yet.
      toast({
        title: "You're not subscribed yet",
        description: 'Open the upgrade dialog to see Premium and Pro plans.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={busy}
      {...rest}
    >
      <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
      {label}
    </Button>
  );
};

export default ManageSubscriptionButton;
