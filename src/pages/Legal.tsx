import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import SEOHead from '@/components/SEOHead';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Building2, Mail, Scale, Copyright } from 'lucide-react';

const Legal: React.FC = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Legal & Imprint - Commodity Hub"
        description="Imprint, company ownership, copyright notice, and legal information for Commodity Hub, operated by Consilair OÜ."
        keywords={["imprint", "legal notice", "Consilair", "copyright", "ownership"]}
      />

      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Scale className="h-6 w-6" />
                Legal Notice & Imprint
              </CardTitle>
              <CardDescription>
                Information in accordance with applicable disclosure requirements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 text-sm leading-relaxed">
              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Building2 className="h-4 w-4" />
                  Company / Ownership
                </h2>
                <p className="text-muted-foreground">
                  This application ("Commodity Hub") is owned, developed, and
                  operated by:
                </p>
                <div className="rounded-md border border-border/50 p-4 space-y-1">
                  <p className="font-medium text-foreground">Consilair OÜ</p>
                  <p className="text-muted-foreground">Estonia (European Union)</p>
                  <p className="text-muted-foreground">
                    Registered in the Estonian Business Register
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Copyright className="h-4 w-4" />
                  Copyright Notice
                </h2>
                <p className="text-muted-foreground">
                  © 2026 Consilair OÜ. All rights reserved.
                </p>
                <p className="text-muted-foreground">
                  All content, source code, design, trademarks, logos, text,
                  graphics, and software made available through this
                  application are the exclusive property of Consilair OÜ or
                  its licensors and are protected by international copyright,
                  trademark, and other intellectual property laws. No part of
                  this application may be reproduced, distributed, modified,
                  reverse-engineered, or transmitted in any form without the
                  prior written permission of Consilair OÜ.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold">Disclaimer</h2>
                <p className="text-muted-foreground">
                  Information presented in this application — including market
                  data, prices, news, and analytics — is provided for
                  informational purposes only and does not constitute
                  financial, investment, legal, or tax advice. Consilair OÜ
                  makes no representations or warranties as to the accuracy,
                  completeness, or timeliness of any data and accepts no
                  liability for any losses or damages arising from reliance
                  on the information provided.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="text-base font-semibold">Third-Party Data & Trademarks</h2>
                <p className="text-muted-foreground">
                  Market data is sourced from third-party providers including
                  OilPriceAPI, Financial Modeling Prep (FMP), and others.
                  All third-party trademarks, service marks, and logos are
                  the property of their respective owners.
                </p>
              </section>

              <section className="space-y-2">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Mail className="h-4 w-4" />
                  Contact
                </h2>
                <p className="text-muted-foreground">
                  For legal inquiries, copyright matters, or general
                  correspondence, please contact Consilair OÜ via the support
                  channels listed in the app.
                </p>
              </section>

              <section className="space-y-2 border-t border-border/50 pt-4">
                <h2 className="text-base font-semibold">Related Policies</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate('/privacy-policy')}>
                    Privacy Policy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => navigate('/terms-of-service')}>
                    Terms of Service
                  </Button>
                </div>
              </section>
            </CardContent>
          </Card>

          {/* Spacer to avoid Android gesture navigation overlap */}
          <div className="h-12 w-full shrink-0" />
        </div>
      </div>
    </>
  );
};

export default Legal;