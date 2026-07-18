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
        description="Learn how Commodity Hub protects your privacy and handles your personal data in compliance with global privacy regulations."
        keywords={["privacy policy", "data protection", "GDPR", "CCPA", "commodity prices", "data security"]}
      />
      
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Shield className="h-6 w-6" />
                Privacy Policy
              </CardTitle>
              <CardDescription>
                Last updated: {new Date().toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Information We Collect
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We collect information you provide directly to us, such as:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Account information (email, name, profile data)</li>
                    <li>Trading preferences and watchlist data</li>
                    <li>Device information and usage analytics</li>
                    <li>Communication preferences</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  How We Use Your Information
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We use the information we collect to:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Provide and maintain our commodity price tracking service</li>
                    <li>Personalize your experience and recommendations</li>
                    <li>Send you important updates and market alerts</li>
                    <li>Improve our services through analytics</li>
                    <li>Ensure security and prevent fraud</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Data Security
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We implement industry-standard security measures including:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>End-to-end encryption for sensitive data</li>
                    <li>Secure cloud infrastructure with SOC 2 compliance</li>
                    <li>Regular security audits and monitoring</li>
                    <li>Multi-factor authentication options</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Share2 className="h-5 w-5" />
                  Information Sharing
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>We do not sell your personal information. We may share information only in these limited circumstances:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>With your explicit consent</li>
                    <li>To comply with legal requirements</li>
                    <li>With trusted service providers under strict agreements</li>
                    <li>To protect our rights and prevent fraud</li>
                  </ul>
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Your Rights
                </h2>
                <div className="space-y-4 text-muted-foreground">
                  <p>You have the right to:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>Access and download your personal data</li>
                    <li>Correct inaccurate information</li>
                    <li>Delete your account and data</li>
                    <li>Opt-out of marketing communications</li>
                    <li>Data portability to other services</li>
                  </ul>
                </div>
              </section>

              <section className="border-t pt-6">
                <h2 className="text-xl font-semibold mb-4">Contact Us</h2>
                <div className="text-muted-foreground">
                  <p>If you have questions about this Privacy Policy, please contact us at:</p>
                  <p className="mt-2">
                    <strong>Commodity Hub Team</strong><br />
                    Email: support@commodityhub.com<br />
                    Address: 1234 Financial District, Suite 567, New York, NY 10004
                  </p>
                </div>
              </section>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};

export default PrivacyPolicy;