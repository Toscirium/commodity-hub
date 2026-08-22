import React from 'react';
import { ExternalLink, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ETORO_ACADEMY_LINKS, buildAcademyUrl, type AcademyLink } from '@/config/affiliates';

/**
 * Curated eToro Academy reading in the Learning Hub.
 *
 * These deliberately open in a new tab rather than an iframe: etoro.com
 * sends `x-frame-options: SAMEORIGIN`, so embedding is refused by the
 * browser (and by the Android WebView) no matter what our own CSP says.
 * Reproducing the articles in-app isn't an option either — they're a
 * regulated broker's content, carrying their compliance disclaimers.
 *
 * Hidden for Premium/Pro subscribers for the same reason TradeCTA is: the
 * paywall sells an "ad-free experience", and an affiliate-attributed
 * outbound link is the closest thing to an ad in the product.
 */
const AcademyFurtherReading: React.FC = () => {
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  if (tier !== 'free') return null;

  const handleClick = (link: AcademyLink) => {
    void supabase.from('affiliate_referral_clicks').insert({
      user_id: auth?.user?.id ?? null,
      provider: 'etoro',
      commodity_symbol: `academy-${link.id}`,
    });
    window.open(buildAcademyUrl(link), '_blank', 'noopener,noreferrer');
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Further reading</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Background material from eToro Academy. These open on eToro's website.
      </p>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {ETORO_ACADEMY_LINKS.map((link) => (
          <Card key={link.id} className="flex flex-col hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{link.title}</CardTitle>
              <CardDescription>{link.blurb}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => handleClick(link)}
              >
                Read on eToro Academy
                <ExternalLink className="w-3 h-3 ml-1.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm font-medium text-destructive border border-destructive/50 rounded-md px-3 py-1.5">
        Educational content published by eToro, an independent third party — not
        Commodity Hub, and not financial advice. eToro offers leveraged products
        that carry a risk of loss. Commodity Hub may earn a referral commission.
      </p>
    </section>
  );
};

export default AcademyFurtherReading;
