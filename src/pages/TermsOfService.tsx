import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SEOHead from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';

const TermsOfService = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Terms of Service - Commodity Hub"
        description="Terms and conditions for using the Commodity Hub commodity price-tracking app."
        keywords={["terms of service", "user agreement", "commodity prices"]}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <FileText className="h-6 w-6 text-primary" />
                <CardTitle>Terms of Service</CardTitle>
              </div>
              <CardDescription>Last updated: August 2, 2026</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 prose prose-sm dark:prose-invert max-w-none">
              <section>
                <h2 className="text-lg font-semibold mb-2">1. About Commodity Hub</h2>
                <p>
                  Commodity Hub is an information service that displays commodity market prices,
                  news, and analytics. We do not execute trades, hold client funds, act as a
                  broker, or provide investment advice. Prices shown are sourced from third-party
                  data providers and may be delayed or inaccurate.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">2. Third-Party Trading Partners &amp; Affiliate Links</h2>
                <p>
                  The "Trade" section of the app links out to independent, third-party brokers
                  (currently Capital.com, eToro, and Kalshi) where you can open your own account to
                  trade CFDs or prediction contracts on commodity prices. These are separate
                  companies, licensed and regulated in their own right — Commodity Hub is not a
                  party to any account, trade, or transaction you enter into with them, does not
                  execute orders, and never has access to your funds or trading credentials.
                </p>
                <p>
                  Commodity Hub may receive a referral commission if you sign up through these
                  links. This does not affect the price or terms you receive from the partner.
                  Trading CFDs and prediction contracts involves substantial risk of loss,
                  including the possibility of losing more than your initial deposit on leveraged
                  products, and may not be available in your jurisdiction — review the partner's
                  own risk disclosures and regulatory status before signing up. CFD trading is not
                  available to residents of the United States, Australia, or Spain through these
                  links.
                </p>
                <p>
                  You must be at least 18 years old to use the "Trade" section or open an account
                  with any linked broker.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">3. Subscriptions</h2>
                <p>
                  Some commodities and features require a paid subscription, billed via Google Play
                  Billing. Subscriptions auto-renew unless cancelled at least 24 hours before the
                  current period ends. You can manage or cancel your subscription in the Google
                  Play Store.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">4. Acceptable Use</h2>
                <p>
                  You agree not to scrape, reverse-engineer, or redistribute the data shown in the
                  app. You may not use the service for any unlawful purpose.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">5. No Investment Advice</h2>
                <p>
                  Nothing in Commodity Hub constitutes investment, financial, tax, or legal advice.
                  Always consult a qualified professional before making investment decisions.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">6. Limitation of Liability</h2>
                <p>
                  The service is provided "as is" without warranties of any kind. To the maximum
                  extent permitted by law, we are not liable for any losses arising from use of the
                  service or reliance on the data shown.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">7. Changes</h2>
                <p>
                  We may update these terms from time to time. Continued use of the app after
                  changes are posted constitutes acceptance.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">8. Contact</h2>
                <p>For questions, contact support@commodityhub.com.</p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default TermsOfService;
