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
import {
  configureRevenueCatWeb,
  getWebOfferings,
  isRevenueCatWebAvailable,
  purchaseWebPackage,
} from '@/services/revenueCatWeb';
// Type-only import — @revenuecat/purchases-js itself is dynamically
// imported inside revenueCatWeb.ts (it bundles its own checkout UI and is
// large), so nothing here should pull the real module into this static
// import graph. WEB_PACKAGE_TYPE below mirrors its PackageType enum's
// string values without importing the enum itself.
import type { Offering as WebOffering, Package as WebPackage } from '@revenuecat/purchases-js';
import { PLAY_STORE_URL } from '@/config/playStore';

// Matches @revenuecat/purchases-js's PackageType.Monthly / .Annual values —
// see the comment above for why these are inlined instead of imported.
const WEB_PACKAGE_TYPE = { Monthly: '$rc_monthly', Annual: '$rc_annual' } as const;

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

/**
 * Normalized shape a plan button renders from, so renderTierCard doesn't
 * need to know whether it's looking at a native RevenueCat package
 * (@revenuecat/purchases-capacitor) or a Web Billing one
 * (@revenuecat/purchases-js) — genuinely different SDKs/types, since the
 * mobile plugin wraps native store billing and the web SDK drives RC's own
 * Stripe-backed checkout.
 */
interface PlanChoice {
  id: string;
  isAnnual: boolean;
  priceString: string;
  perMonthString: string | null;
  savingsPct: number | null;
  purchasing: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export const buildNativePlanChoices = (
  pkgs: PurchasesPackage[],
  purchasingId: string | null,
  onSelect: (pkg: PurchasesPackage) => void,
): PlanChoice[] => {
  const savingsPct = getAnnualSavingsPct(pkgs);
  return orderWithAnnualFirst(pkgs).map((pkg) => {
    const isAnnual = pkg.packageType === 'ANNUAL';
    return {
      id: pkg.identifier,
      isAnnual,
      priceString: pkg.product.priceString,
      perMonthString: isAnnual ? (pkg.product.pricePerMonthString ?? null) : null,
      savingsPct: isAnnual ? savingsPct : null,
      purchasing: purchasingId === pkg.identifier,
      disabled: purchasingId !== null,
      onSelect: () => onSelect(pkg),
    };
  });
};

export const buildWebPlanChoices = (
  pkgs: WebPackage[],
  purchasingId: string | null,
  onSelect: (pkg: WebPackage) => void,
): PlanChoice[] => {
  const monthly = pkgs.find((p) => p.packageType === WEB_PACKAGE_TYPE.Monthly);
  const annual = pkgs.find((p) => p.packageType === WEB_PACKAGE_TYPE.Annual);
  const monthlyMicros = monthly?.webBillingProduct.price.amountMicros;
  const annualPerMonthMicros = annual?.webBillingProduct.defaultSubscriptionOption?.base.pricePerMonth?.amountMicros;
  let savingsPct: number | null = null;
  if (monthlyMicros && annualPerMonthMicros) {
    const pct = (1 - annualPerMonthMicros / monthlyMicros) * 100;
    savingsPct = pct > 0 ? Math.round(pct) : null;
  }
  const ordered = [...pkgs].sort((a, b) =>
    a.packageType === WEB_PACKAGE_TYPE.Annual ? -1 : b.packageType === WEB_PACKAGE_TYPE.Annual ? 1 : 0,
  );
  return ordered.map((pkg) => {
    const isAnnual = pkg.packageType === WEB_PACKAGE_TYPE.Annual;
    return {
      id: pkg.identifier,
      isAnnual,
      priceString: pkg.webBillingProduct.price.formattedPrice,
      perMonthString: isAnnual
        ? (pkg.webBillingProduct.defaultSubscriptionOption?.base.pricePerMonth?.formattedPrice ?? null)
        : null,
      savingsPct: isAnnual ? savingsPct : null,
      purchasing: purchasingId === pkg.identifier,
      disabled: purchasingId !== null,
      onSelect: () => onSelect(pkg),
    };
  });
};

const PremiumPaywall: React.FC<PremiumPaywallProps> = ({ open, onOpenChange, source = 'unknown' }) => {
  const { toast } = useToast();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isNative } = usePlatform();
  const [offering, setOffering] = React.useState<PurchasesOffering | null>(null);
  const [webOffering, setWebOffering] = React.useState<WebOffering | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [purchasing, setPurchasing] = React.useState<string | null>(null);
  const [webPurchasing, setWebPurchasing] = React.useState<string | null>(null);
  const tier = auth?.tier ?? 'free';
  // An existing Premium subscriber opening the paywall is upgrading, not
  // subscribing fresh — they get the Pro card on its own rather than the
  // full two-card comparison (and, before this, an "already a subscriber"
  // dead end with no way through to Pro at all).
  const isUpgrading = tier === 'premium';
  const isSignedIn = Boolean(auth?.user);
  const revenueCatReady = isRevenueCatAvailable();
  const webBillingReady = isRevenueCatWebAvailable();

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

  // Web Billing counterpart of the effect above. Unlike native, this only
  // configures once signed in — the web SDK requires a real appUserId (no
  // built-in anonymous-browsing config the way the native plugin has), and
  // purchasing already requires an account anyway (see the "create account
  // to subscribe" gate below), so there's nothing to gain from configuring
  // for a signed-out visitor here.
  React.useEffect(() => {
    if (!open || isNative || !auth?.user?.id) return;
    if (!isRevenueCatWebAvailable()) return;

    (async () => {
      setLoading(true);
      await configureRevenueCatWeb(auth.user!.id);
      const current = await getWebOfferings();
      setWebOffering(current);
      monitoringService.trackUserEvent('paywall_offering_loaded', {
        source,
        platform: 'web',
        premium_packages: current?.availablePackages.filter((pkg) => pkg.webBillingProduct.identifier.startsWith('premium_lite')).length ?? 0,
        pro_packages: current?.availablePackages.filter((pkg) => !pkg.webBillingProduct.identifier.startsWith('premium_lite')).length ?? 0,
      });
      setLoading(false);
    })();
  }, [open, isNative, auth?.user?.id]);

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

  const handleWebPurchase = async (pkg: WebPackage) => {
    setWebPurchasing(pkg.identifier);
    const result = await purchaseWebPackage(pkg, {
      paywall_source: source,
      tier_target: pkg.webBillingProduct.identifier.startsWith('premium_lite') ? 'premium' : 'pro',
    });
    setWebPurchasing(null);

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
  // Native and Web Billing are grouped separately since they're never both
  // active at once (one is native-platform-only, the other web-only) but
  // carry different package types.
  const nativePackagesByTier = React.useMemo(() => {
    const byTier: { premium: PurchasesPackage[]; pro: PurchasesPackage[] } = { premium: [], pro: [] };
    offering?.availablePackages.forEach((pkg) => {
      const id = pkg.product.identifier;
      if (id.startsWith('premium_lite')) byTier.premium.push(pkg);
      else byTier.pro.push(pkg);
    });
    return byTier;
  }, [offering]);

  // Requires the Web Billing product identifiers configured in the
  // RevenueCat dashboard to follow the same premium_lite_* / premium_*
  // convention as the Play Store products (see TIER_PRICING in tiers.ts) —
  // that's what this split matches on.
  const webPackagesByTier = React.useMemo(() => {
    const byTier: { premium: WebPackage[]; pro: WebPackage[] } = { premium: [], pro: [] };
    webOffering?.availablePackages.forEach((pkg) => {
      const id = pkg.webBillingProduct.identifier;
      if (id.startsWith('premium_lite')) byTier.premium.push(pkg);
      else byTier.pro.push(pkg);
    });
    return byTier;
  }, [webOffering]);

  const renderTierCard = (
    accent: 'default' | 'pro',
    title: string,
    features: string[],
    planChoices: PlanChoice[],
  ) => {
    // Real, region-correct price from RevenueCat when we have it — never a
    // hardcoded USD figure, since store prices vary by country/currency.
    // Nothing is shown when we don't have live package data (a platform
    // without RevenueCat/Web Billing configured).
    const monthlyChoice = planChoices.find((c) => !c.isAnnual);
    return (
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
          {monthlyChoice && (
            <span className="text-sm font-semibold">{monthlyChoice.priceString}/mo</span>
          )}
        </div>
        <ul className="space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs">
              <Check className="w-3.5 h-3.5 text-primary mt-0.5 flex-shrink-0" />
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>
        {isSignedIn && planChoices.length > 0 && (
          <div className="space-y-2 pt-1">
            {planChoices.map((choice) => (
              <div key={choice.id} className="space-y-1">
                <Button
                  onClick={choice.onSelect}
                  disabled={choice.disabled}
                  className="w-full justify-between"
                  // Annual is always the visually primary choice when it's
                  // an option — Monthly steps back to outline, regardless
                  // of the card's own Premium/Pro accent.
                  variant={choice.isAnnual ? 'default' : 'outline'}
                  size="sm"
                >
                  <span className="flex items-center gap-1.5">
                    {choice.isAnnual ? 'Annual' : 'Monthly'}
                    {choice.isAnnual && choice.savingsPct && (
                      <Badge variant="secondary" className="text-[10px]">Save {choice.savingsPct}%</Badge>
                    )}
                  </span>
                  <span>
                    {choice.purchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : choice.priceString}
                  </span>
                </Button>
                {choice.isAnnual && choice.perMonthString && (
                  <p className="text-[10px] text-muted-foreground text-right pr-1">
                    just {choice.perMonthString}/mo, billed annually
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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
            Start with Premium for more alerts, exports, and portfolios. Move to Pro when you need advanced analytics.
          </DialogDescription>
        </DialogHeader>

        {tier === 'pro' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              You're already a Pro subscriber — thanks for supporting Commodity Hub.
            </div>
            <ManageSubscriptionButton className="w-full" variant="default" size="default" />
          </div>
        ) : isUpgrading && !isNative ? (
          // Web subscribers change plans in RevenueCat's billing portal. The
          // web SDK has no product-change equivalent of Android's
          // googleProductChangeInfo (see revenueCat.ts), so starting a fresh
          // checkout here would open a SECOND subscription alongside the
          // current one rather than replacing it.
          <div className="space-y-3">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              You're on Premium. Switch to Pro from your subscription portal so your
              current plan is replaced rather than billed twice.
            </div>
            <ManageSubscriptionButton className="w-full" variant="default" size="default" label="Change plan" />
          </div>
        ) : loading && (isNative || webBillingReady) ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {isUpgrading && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                You're on Premium. Upgrading replaces your current plan — Google Play
                credits what you've already paid for the rest of this period.
              </div>
            )}
            <div className={`grid gap-3 ${isUpgrading ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {!isUpgrading && renderTierCard(
                'default',
                TIER_PRICING.premium.label,
                PREMIUM_FEATURES,
                isNative
                  ? buildNativePlanChoices(nativePackagesByTier.premium, purchasing, handlePurchase)
                  : buildWebPlanChoices(webPackagesByTier.premium, webPurchasing, handleWebPurchase),
              )}
              {renderTierCard(
                'pro',
                TIER_PRICING.pro.label,
                PRO_FEATURES,
                isNative
                  ? buildNativePlanChoices(nativePackagesByTier.pro, purchasing, handlePurchase)
                  : buildWebPlanChoices(webPackagesByTier.pro, webPurchasing, handleWebPurchase),
              )}
            </div>
            {isUpgrading && (
              <ManageSubscriptionButton className="w-full" variant="outline" size="default" />
            )}
            {!isNative && !webBillingReady && (
              // Web, but Web Billing isn't configured (VITE_REVENUECAT_WEB_KEY
              // unset) — fall back to pointing people at the Android app
              // rather than showing tier cards with zero purchase buttons.
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
            {((isNative && revenueCatReady) || (!isNative && webBillingReady)) && !isSignedIn && (
              // A purchase made while signed out is tied to RevenueCat's
              // anonymous device ID (native) or has nowhere to configure
              // against (web) — not a Supabase user — so the webhook has no
              // profiles row to attach it to and the subscription would
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
              // Web Billing has no client-side "restore" concept — a signed-in
              // user's entitlements are already resolved straight from their
              // appUserId via getCustomerInfo(), there's no on-device receipt
              // to restore the way native store purchases have.
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
