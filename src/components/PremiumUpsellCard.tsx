import React from 'react';
import { Lock, Factory, Zap, Gem, Wheat, Coffee, Beef, Smartphone } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PremiumPaywall from '@/components/PremiumPaywall';
import { usePlatform } from '@/hooks/usePlatform';
import { monitoringService } from '@/services/monitoringService';

type UpsellVariant = 'energy' | 'industrials' | 'metals' | 'grains' | 'softs' | 'livestock';

interface PremiumUpsellCardProps {
  onUpgrade?: () => void;
  variant?: UpsellVariant;
}

const COPY: Record<UpsellVariant, {
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = {
  energy: {
    title: 'Unlock refined-product energy benchmarks',
    description: 'RBOB Gasoline and Heating Oil (ULSD) NYMEX futures — the two refined-product legs behind every crack-spread strategy — plus Pro-tier crack-spread and calendar-spread analytics against WTI, Brent and Natural Gas.',
    Icon: Zap,
  },
  industrials: {
    title: 'Unlock industrial benchmarks',
    description: 'Industrial Ethanol, Rubber, and Cobalt — settled prices used in supply contracts.',
    Icon: Factory,
  },
  metals: {
    title: 'Unlock industrial & specialty metals',
    description: 'Palladium, Aluminum, Zinc, Iron Ore, Lead, Nickel, Tin, Steel, HRC Steel, Titanium and Lithium — exchange and reference quotes used by procurement teams.',
    Icon: Gem,
  },
  grains: {
    title: 'Unlock grain & vegetable-oil benchmarks',
    description: 'Soybean Oil, Soybean Meal, Oats, Rough Rice, Canola and Sunflower Oil — futures + reference pricing for crushers and traders.',
    Icon: Wheat,
  },
  softs: {
    title: 'Unlock soft-commodity benchmarks',
    description: 'Orange Juice, UK Sugar No 5 (white sugar) and Palm Oil — the contracts industry buyers actually price against.',
    Icon: Coffee,
  },
  livestock: {
    title: 'Unlock dairy benchmarks',
    description: 'Class III Milk futures pricing for dairy procurement.',
    Icon: Beef,
  },
};

const PremiumUpsellCard: React.FC<PremiumUpsellCardProps> = ({ onUpgrade, variant = 'energy' }) => {
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const { title, description, Icon } = COPY[variant];
  const { isNative } = usePlatform();

  React.useEffect(() => {
    monitoringService.trackUserEvent('upsell_impression', { placement: 'catalog', variant, is_native: isNative });
  }, [isNative, variant]);

  const handleClick = () => {
    monitoringService.trackUserEvent('upsell_cta_tapped', { placement: 'catalog', variant, is_native: isNative });
    if (onUpgrade) onUpgrade();
    else setPaywallOpen(true);
  };

  return (
    <>
      <Card className="mb-6 border-primary/30 bg-card overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {title}
                  <Badge variant="secondary" className="text-[10px]">PREMIUM</Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  {description}
                  <span className="block mt-1 text-foreground/80">
                    One subscription unlocks every premium benchmark across all groups, with transparent <strong>LIVE</strong> / <strong>EOD</strong> / <strong>REF</strong> sourcing labels on each market.
                  </span>
                  <span className="block mt-1 font-medium text-foreground">
                    Premium starts at $6.99/mo for alerts, exports, and up to 3 portfolios. Pro adds advanced analytics.
                  </span>
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={handleClick} className="flex-shrink-0">
              {isNative ? <Lock className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
              {isNative ? 'See plans' : 'See plans'}
            </Button>
          </div>
        </CardHeader>
      </Card>
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} source={`catalog_${variant}`} />
    </>
  );
};

export default PremiumUpsellCard;
