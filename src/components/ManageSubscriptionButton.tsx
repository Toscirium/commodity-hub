import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button, type ButtonProps } from '@/components/ui/button';
import { getActiveProductId, isRevenueCatAvailable } from '@/services/revenueCat';
import { configureRevenueCatWeb, getWebManagementUrl, isRevenueCatWebAvailable } from '@/services/revenueCatWeb';
import { buildPlayStoreManageSubscriptionUrl } from '@/config/playStore';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const IOS_MANAGE_URL = 'itms-apps://apps.apple.com/account/subscriptions';

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

  const handleClick = async () => {
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const platform = Capacitor.getPlatform();
        const productId = isRevenueCatAvailable() ? await getActiveProductId() : null;
        const url = platform === 'ios' ? IOS_MANAGE_URL : buildPlayStoreManageSubscriptionUrl(productId);
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
        return;
      }

      // Web: no generic fallback page the way Play Store has one — the
      // management URL is a Stripe Billing Portal session tied to this
      // specific customer, so there's nothing sane to link to without it.
      // This button can render before PremiumPaywall has ever configured
      // the Web Billing SDK this session (see UserProfile/AccountSettings/
      // BillingStatusBanner), so self-configure here rather than assume it.
      if (isRevenueCatWebAvailable() && auth?.user?.id) {
        await configureRevenueCatWeb(auth.user.id);
        const url = await getWebManagementUrl();
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
      }
      // Not an error — this button renders for every signed-in user
      // regardless of tier (see UserProfile/AccountSettings), and most
      // people clicking it simply aren't subscribed yet. Native side has a
      // generic Play Store subscriptions page to fall back to in this same
      // situation; there's no web equivalent, so this is the fallback.
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