import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button, type ButtonProps } from '@/components/ui/button';
import { getActiveProductId, isRevenueCatAvailable } from '@/services/revenueCat';

// Must match android/app/build.gradle's applicationId — was
// 'com.commodityhub.app' (doesn't match anything real), same wrong ID as
// PremiumPaywall.tsx used to have. With the wrong package, this deep link
// to a subscriber's specific subscription in Play Store's management page
// wouldn't resolve correctly.
const ANDROID_PACKAGE = 'app.lovable.c8fabd7a96c74aff8d7b001690ec23c7';
const IOS_MANAGE_URL = 'itms-apps://apps.apple.com/account/subscriptions';

const buildPlayStoreUrl = (productId: string | null) => {
  const base = 'https://play.google.com/store/account/subscriptions';
  if (!productId) return base;
  return `${base}?sku=${encodeURIComponent(productId)}&package=${ANDROID_PACKAGE}`;
};

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

  const handleClick = async () => {
    setBusy(true);
    try {
      const platform = Capacitor.getPlatform();
      const productId = isRevenueCatAvailable() ? await getActiveProductId() : null;

      let url = buildPlayStoreUrl(productId);
      if (platform === 'ios') url = IOS_MANAGE_URL;

      if (Capacitor.isNativePlatform()) {
        const { Browser } = await import('@capacitor/browser');
        await Browser.open({ url });
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
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