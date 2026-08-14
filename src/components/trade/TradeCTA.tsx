import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AFFILIATE_PROVIDERS,
  buildAffiliateUrl,
  isProviderAvailableFor,
  type AffiliateProvider,
} from '@/config/affiliates';

interface TradeCTAProps {
  symbol: string;
  commodityName: string;
  className?: string;
}

/**
 * Outbound CTAs to independent, regulated brokers — currently eToro CFDs
 * only (see src/config/affiliates.ts). Commodity Hub never executes the
 * trade or touches funds — clicking logs a referral event, then opens the
 * partner's own signup flow in a new tab.
 */
const TradeCTA: React.FC<TradeCTAProps> = ({ symbol, commodityName, className }) => {
  const auth = useAuth();

  const handleClick = (provider: AffiliateProvider) => {
    const url = buildAffiliateUrl(provider, symbol);
    if (!url) return;
    void supabase.from('affiliate_referral_clicks').insert({
      user_id: auth?.user?.id ?? null,
      provider,
      commodity_symbol: symbol,
    });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const providers = (Object.values(AFFILIATE_PROVIDERS) as (typeof AFFILIATE_PROVIDERS)[AffiliateProvider][]).filter(
    (p) => isProviderAvailableFor(p.id, symbol),
  );

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => {
          const url = buildAffiliateUrl(provider.id, symbol);
          return (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={!url}
              onClick={() => handleClick(provider.id)}
              title={!url ? `${provider.name} referral link not configured yet` : provider.tagline}
            >
              Trade on {provider.name}
              <ExternalLink className="w-3 h-3 ml-1.5" />
            </Button>
          );
        })}
      </div>
      <p className="text-sm font-medium text-destructive border border-destructive/50 rounded-md px-3 py-1.5 mt-1">
        Risk of loss: {commodityName} CFDs/contracts are leveraged products offered by external,
        independent brokers, not Commodity Hub. Commodity Hub may earn a referral commission.
      </p>
    </div>
  );
};

export default TradeCTA;
