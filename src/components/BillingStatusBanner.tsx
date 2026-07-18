import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton';
import { cn } from '@/lib/utils';

const DISMISS_KEY_PREFIX = 'billing-banner-dismissed:';

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const BillingStatusBanner: React.FC = () => {
  const auth = useAuth();
  const billingState = auth?.billingState ?? 'none';
  const graceDate = formatDate(auth?.gracePeriodExpiresAt ?? null);

  const dismissKey = `${DISMISS_KEY_PREFIX}${billingState}`;
  const [dismissed, setDismissed] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(dismissKey) === '1';
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setDismissed(sessionStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  if (!auth?.user) return null;
  if (billingState !== 'grace' && billingState !== 'on_hold') return null;
  if (dismissed) return null;

  const isGrace = billingState === 'grace';
  const message = isGrace
    ? `Payment issue with your Premium subscription.${graceDate ? ` Update your payment method by ${graceDate} to keep access.` : ' Update your payment method to keep access.'}`
    : 'Your Premium subscription is paused. Update your payment method to restore access.';

  const handleDismiss = () => {
    if (typeof window !== 'undefined') sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className={cn(
        'w-full border-b px-4 py-2.5 flex items-center gap-3',
        isGrace
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
          : 'bg-destructive/10 border-destructive/30 text-destructive-foreground',
      )}
    >
      <AlertTriangle className={cn('w-4 h-4 flex-shrink-0', isGrace ? 'text-amber-400' : 'text-destructive')} />
      <p className="text-sm flex-1 leading-snug">{message}</p>
      <ManageSubscriptionButton size="sm" variant={isGrace ? 'outline' : 'default'} />
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="p-1 rounded hover:bg-foreground/10 text-muted-foreground"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default BillingStatusBanner;