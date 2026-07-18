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
              <CardDescription>Last updated: {new Date().toLocaleDateString()}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 prose prose-sm dark:prose-invert max-w-none">
              <section>
                <h2 className="text-lg font-semibold mb-2">1. About Commodity Hub</h2>
                <p>
                  Commodity Hub is an information service that displays commodity market prices,
                  news, and analytics. We do not offer trading, brokerage, custody, or investment
                  advice. Prices shown are sourced from third-party data providers and may be
                  delayed or inaccurate.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">2. Subscriptions</h2>
                <p>
                  Some commodities and features require a paid subscription, billed via Google Play
                  Billing. Subscriptions auto-renew unless cancelled at least 24 hours before the
                  current period ends. You can manage or cancel your subscription in the Google
                  Play Store.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">3. Acceptable Use</h2>
                <p>
                  You agree not to scrape, reverse-engineer, or redistribute the data shown in the
                  app. You may not use the service for any unlawful purpose.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">4. No Investment Advice</h2>
                <p>
                  Nothing in Commodity Hub constitutes investment, financial, tax, or legal advice.
                  Always consult a qualified professional before making investment decisions.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">5. Limitation of Liability</h2>
                <p>
                  The service is provided "as is" without warranties of any kind. To the maximum
                  extent permitted by law, we are not liable for any losses arising from use of the
                  service or reliance on the data shown.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">6. Changes</h2>
                <p>
                  We may update these terms from time to time. Continued use of the app after
                  changes are posted constitutes acceptance.
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold mb-2">7. Contact</h2>
                <p>For questions, contact support@commodityhub.app.</p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default TermsOfService;
