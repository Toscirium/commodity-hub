import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check, Loader2, Sparkles, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatform } from '@/hooks/usePlatform';
import { monitoringService } from '@/services/monitoringService';
import ManageSubscriptionButton from '@/components/ManageSubscriptionButton';
import { TIER_PRICING } from '@/utils/tiers';
import {
  configureRevenueCat,
  getOfferings,
  isRevenueCatAvailable,
  purchasePackage,
  restorePurchases,
} from '@/services/revenueCat';
import type { PurchasesOffering, PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { PLAY_STORE_URL } from '@/config/playStore';

interface PremiumPaywallProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The feature or moment that prompted the upgrade conversation. */
  source?: string;
}

const PREMIUM_FEATURES = [
  '10 active price alerts',
  'Up to 3 portfolios',
  'CSV export of positions & alerts',
  'Full standard commodity catalog',
  'Ad-free experience',
];

const PRO_FEATURES = [
  'Everything in Premium, plus:',
  '50 active price alerts',
  'Unlimited portfolios',
  'Pro analytics: spread monitor, seasonality, regime scanner',
  'Backtest sandbox + portfolio VaR & drawdown',
  'Priority data refresh',
];


/**
 * Annual and monthly packages were rendered as two identical-looking
 * buttons with no framing — nothing nudged toward the plan that's actually
 * better for both sides (locks in revenue upfront, cuts monthly churn
 * opportunities). This orders Annual first when both exist and returns the
 * % saved vs. paying monthly all year, so the UI can call it out.
 */
export const orderWithAnnualFirst = (pkgs: PurchasesPackage[]): PurchasesPackage[] =>
  [...pkgs].sort((a, b) => (a.packageType === 'ANNUAL' ? -1 : b.packageType === 'ANNUAL' ? 1 : 0));

export const getAnnualSavingsPct = (pkgs: PurchasesPackage[]): number | null => {
  const monthly = pkgs.find((p) => p.packageType === 'MONTHLY');
  const annual = pkgs.find((p) => p.packageType === 'ANNUAL');
  if (!monthly || !annual || !annual.product.pricePerMonth) return null;
  const pct = (1 - annual.product.pricePerMonth / monthly.product.price) * 100;
  return pct > 0 ? Math.round(pct) : null;
};

const PremiumPaywall: React.FC<PremiumPaywallProps> = ({ open, onOpenChange, source = 'unknown' }) => {
  const { toast } = useToast();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isNative } = usePlatform();
  const [offering, setOffering] = React.useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [purchasing, setPurchasing] = React.useState<string | null>(null);
  const tier = auth?.tier ?? 'free';
  const isPaid = tier !== 'free';
  const isSignedIn = Boolean(auth?.user);
  const revenueCatReady = isRevenueCatAvailable();

  React.useEffect(() => {
    if (!open) return;
    monitoringService.trackUserEvent('paywall_viewed', {
      is_native: isNative,
      tier,
      source,
    });
  }, [open, isNative, tier]);

  // Coming back from the "create account to subscribe" redirect: reopen
  // this same paywall instead of leaving the user to find their way back
  // and tap "upgrade" all over again. Clears the flag from history state
  // right after so it doesn't keep reopening on later visits to this page.
  React.useEffect(() => {
    const state = location.state as { reopenPaywall?: boolean } | null;
    if (!state?.reopenPaywall || !isSignedIn) return;
    onOpenChange(true);
    navigate(location.pathname + location.search, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, isSignedIn]);

  React.useEffect(() => {
    if (!open) return;
    if (!isRevenueCatAvailable()) return;

    (async () => {
      setLoading(true);
      await configureRevenueCat(auth?.user?.id ?? null);
      const current = await getOfferings();
      setOffering(current);
      monitoringService.trackUserEvent('paywall_offering_loaded', {
        source,
        premium_packages: current?.availablePackages.filter((pkg) => pkg.product.identifier.startsWith('premium_lite')).length ?? 0,
        pro_packages: current?.availablePackages.filter((pkg) => !pkg.product.identifier.startsWith('premium_lite')).length ?? 0,
      });
      setLoading(false);
    })();
  }, [open, auth?.user?.id]);

  const handlePurchase = async (pkg: PurchasesPackage) => {
    setPurchasing(pkg.identifier);
    const result = await purchasePackage(pkg, { paywall_source: source, tier_target: pkg.product.identifier.startsWith('premium_lite') ? 'premium' : 'pro' });
    setPurchasing(null);

    if (result.success) {
      toast({
        title: 'Subscription active!',
        description: 'Your new tier is now unlocked.',
      });
      await auth?.refreshProfile();
      onOpenChange(false);
    } else if (result.error && result.error !== 'cancelled') {
      toast({
        title: 'Purchase failed',
        description: result.error,
        variant: 'destructive',
      });
    }
  };

  const handleRestore = async () => {
    setLoading(true);
    const restored = await restorePurchases();
    setLoading(false);
    toast({
      title: restored ? 'Purchases restored' : 'Nothing to restore',
      description: restored
        ? 'Your subscription has been re-activated.'
        : 'No previous purchase found on this account.',
    });
    if (restored) {
      await auth?.refreshProfile();
      onOpenChange(false);
    }
  };

  // Group packages by which tier they belong to so we can render two cards.
  const packagesByTier = React.useMemo(() => {
    const byTier: { premium: PurchasesPackage[]; pro: PurchasesPackage[] } = {
      premium: [],
      pro: [],
    };
    offering?.availablePackages.forEach((pkg) => {
      const id = pkg.product.identifier;
      if (id.startsWith('premium_lite')) byTier.premium.push(pkg);
      else byTier.pro.push(pkg);
    });
    return byTier;
  }, [offering]);

  const renderTierCard = (
    tierKey: 'premium' | 'pro',
    accent: 'default' | 'pro',
    title: string,
    priceLabel: string,
    features: string[],
    pkgs: PurchasesPackage[],
  ) => (
    <div
      className={`rounded-lg border p-4 space-y-3 ${
        accent === 'pro' ? 'border-primary bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {accent === 'pro' ? (
            <Zap className="w-4 h-4 text-primary" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary" />
          )}
          <span className="font-semibold">{title}</span>
          {accent === 'pro' && (
            <Badge variant="default" className="text-[10px]">BEST VALUE</Badge>
          )}
        </div>
        <span className="text-sm font-semibold">{priceLabel}</span>
      </div>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs">
            <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>
      {isNative && isSignedIn && pkgs.length > 0 && (() => {
        const savingsPct = getAnnualSavingsPct(pkgs);
        return (
          <div className="space-y-2 pt-1">
            {orderWithAnnualFirst(pkgs).map((pkg) => {
              const isAnnual = pkg.packageType === 'ANNUAL';
              return (
                <div key={pkg.identifier} className="space-y-1">
                  <Button
                    onClick={() => handlePurchase(pkg)}
                    disabled={purchasing !== null}
                    className="w-full justify-between"
                    // Annual is always the visually primary choice when it's
                    // an option — Monthly steps back to outline, regardless
                    // of the card's own Premium/Pro accent.
                    variant={isAnnual ? 'default' : 'outline'}
                    size="sm"
                  >
                    <span className="flex items-center gap-1.5">
                      {isAnnual ? 'Annual' : 'Monthly'}
                      {isAnnual && savingsPct && (
                        <Badge variant="secondary" className="text-[10px]">Save {savingsPct}%</Badge>
                      )}
                    </span>
                    <span>
                      {purchasing === pkg.identifier ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        pkg.product.priceString
                      )}
                    </span>
                  </Button>
                  {isAnnual && pkg.product.pricePerMonthString && (
                    <p className="text-[10px] text-muted-foreground text-right pr-1">
                      just {pkg.product.pricePerMonthString}/mo, billed annually
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <DialogTitle>Upgrade Commodity Hub</DialogTitle>
          </div>
          <DialogDescription>
            Start with Premium at $6.99/month for more alerts, exports, and portfolios. Move to Pro when you need advanced analytics.
          </DialogDescription>
        </DialogHeader>

        {isPaid ? (
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              You're already a {tier === 'pro' ? 'Pro' : 'Premium'} subscriber — thanks for supporting Commodity Hub.
            </div>
            <ManageSubscriptionButton className="w-full" variant="default" size="default" />
          </div>
        ) : loading && isNative ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {renderTierCard(
                'premium',
                'default',
                TIER_PRICING.premium.label,
                `$${TIER_PRICING.premium.monthly.toFixed(2)}/mo`,
                PREMIUM_FEATURES,
                packagesByTier.premium,
              )}
              {renderTierCard(
                'pro',
                'pro',
                TIER_PRICING.pro.label,
                `$${TIER_PRICING.pro.monthly.toFixed(2)}/mo`,
                PRO_FEATURES,
                packagesByTier.pro,
              )}
            </div>
            {!isNative && (
              <>
                <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Subscriptions are currently only available in the Android app.
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    monitoringService.trackUserEvent('paywall_download_cta_tapped', { source });
                    window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Get Premium on Android
                </Button>
              </>
            )}
            {isNative && !revenueCatReady && (
              // Native app, but this platform has no RevenueCat key configured
              // (today: iOS — VITE_REVENUECAT_IOS_KEY is unset). Without this,
              // both tier cards above render with zero purchase buttons and no
              // explanation, which reads as broken rather than unavailable.
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                Subscriptions aren't available on this platform yet.
              </div>
            )}
            {isNative && revenueCatReady && !isSignedIn && (
              // A purchase made while signed out is tied to RevenueCat's
              // anonymous device ID, not a Supabase user — the webhook has
              // no profiles row to attach it to, so the subscription would
              // never actually unlock anything server-side. Require an
              // account first rather than let that purchase happen.
              <div className="space-y-2">
                <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                  Create a free account first — it's how your subscription gets linked to your data across devices.
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    onOpenChange(false);
                    navigate('/auth', {
                      state: {
                        from: location.pathname + location.search,
                        reopenPaywall: true,
                      },
                    });
                  }}
                >
                  Create account to subscribe
                </Button>
              </div>
            )}
            {isNative && revenueCatReady && isSignedIn && (
              <Button variant="ghost" size="sm" className="w-full" onClick={handleRestore}>
                Restore previous purchase
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PremiumPaywall;
