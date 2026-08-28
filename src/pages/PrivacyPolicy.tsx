import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SEOHead from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Shield, Eye, Lock, Database, Bell, Share2 } from 'lucide-react';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Privacy Policy - Commodity Hub"
        description="How Commodity Hub collects, uses, retains, and protects personal data."
        keywords={["privacy policy", "data protection", "commodity prices"]}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-8">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl"><Shield className="h-6 w-6" />Privacy Policy</CardTitle>
              <CardDescription>Effective date: July 18, 2026</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 text-muted-foreground">
              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground"><Eye className="h-5 w-5" />Information we collect</h2>
                <ul className="ml-4 list-inside list-disc space-y-2">
                  <li><strong>Account data:</strong> email address, account identifier, and any profile information you provide.</li>
                  <li><strong>App data:</strong> watchlists, portfolios, price alerts, saved comparisons, preferences, and support requests.</li>
                  <li><strong>Subscription data:</strong> subscription status and purchase entitlement. Payment-card details are handled by the relevant app store and are not stored by us.</li>
                  <li><strong>Device and notification data:</strong> a push-notification token only after you grant notification permission and register for alerts.</li>
                  <li><strong>AI Copilot content:</strong> messages you submit and the app data needed to answer a request, such as relevant portfolio, watchlist, or alert data.</li>
                  <li><strong>Technical data:</strong> limited operational data such as browser/app version, route, and error details needed to maintain security and reliability. We do not use advertising IDs or collect precise location.</li>
                  <li><strong>Product usage and session replay:</strong> which pages you open and what you interact with, recorded so we can find where the app fails or confuses people. Text you type into fields is masked before it leaves your device.</li>
                  <li><strong>Feedback you send us:</strong> your message, the page you were on, your browser version, and an email address only if you choose to provide one.</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground"><Database className="h-5 w-5" />How we use it</h2>
                <ul className="ml-4 list-inside list-disc space-y-2">
                  <li>Provide accounts, market-data features, saved content, alerts, and customer support.</li>
                  <li>Process and verify subscriptions, prevent fraud, and secure the service.</li>
                  <li>Generate AI Copilot responses when you choose to use that feature.</li>
                  <li>Diagnose outages and improve reliability. We do not sell personal information or use it for interest-based advertising.</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground"><Share2 className="h-5 w-5" />Service providers and sharing</h2>
                <p>We share data only as needed to operate the service or where required by law. Our providers may include:</p>
                <ul className="ml-4 mt-3 list-inside list-disc space-y-2">
                  <li><strong>Supabase</strong> for authentication, database, server functions, and secure storage.</li>
                  <li><strong>RevenueCat and the app stores</strong> for subscription entitlement and purchase processing.</li>
                  <li><strong>Firebase Cloud Messaging</strong> to deliver notifications when you opt in.</li>
                  <li><strong>AI service providers</strong> for AI Copilot requests you submit.</li>
                  <li><strong>Market-data and news providers</strong> to deliver requested market information; these requests are not sent with your account profile.</li>
                  <li><strong>PostHog</strong> (EU-hosted) for product analytics and session replay, used to find where the app is confusing or broken. Replays record on-screen interaction and navigation; the contents of input fields are masked before leaving your device, and we do not record payment details. Sessions are linked to your account identifier and subscription tier, not your email address.</li>
                </ul>
                <p className="mt-3">We do not sell or share personal information for cross-context behavioral advertising.</p>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground"><Lock className="h-5 w-5" />Security and retention</h2>
                <p>We use access controls, encrypted transport (HTTPS/TLS), database row-level security, and restricted server-side credentials to protect data. No security measure is absolute, and we do not claim end-to-end encryption or a certification unless explicitly stated elsewhere.</p>
                <p className="mt-3">We retain account and app data while your account is active. When you delete your account, we delete the account and associated application data, subject to limited retention required for legal, security, fraud-prevention, or transaction-record obligations.</p>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground"><Bell className="h-5 w-5" />Your choices and rights</h2>
                <ul className="ml-4 list-inside list-disc space-y-2">
                  <li>Update account information in the app where available.</li>
                  <li>Disable push notifications in your device settings.</li>
                  <li>Delete your account from <a className="underline" href="/delete-account">Delete account</a>. Cancel an active app-store subscription before deletion.</li>
                  <li>Request access, correction, export, restriction, objection, or deletion by emailing support@commodityhub.com. Depending on your location, you may also have the right to lodge a complaint with your data-protection authority.</li>
                </ul>
              </section>

              <section>
                <h2 className="mb-4 text-xl font-semibold text-foreground">International transfers and children</h2>
                <p>Our providers may process data in countries other than yours. We use appropriate safeguards where required. Commodity Hub is not directed to children under 13 (or the minimum age required in your jurisdiction), and we do not knowingly collect their personal information.</p>
              </section>

              <section className="border-t pt-6">
                <h2 className="mb-4 text-xl font-semibold text-foreground">Contact and changes</h2>
                <p>Commodity Hub is the controller for the personal data described here. For privacy questions or requests, contact <a className="underline" href="mailto:support@commodityhub.com">support@commodityhub.com</a>. We will post any material changes on this page and update the effective date above.</p>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default PrivacyPolicy;
