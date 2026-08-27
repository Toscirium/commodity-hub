import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LineChart, Wheat, Briefcase, ShieldCheck, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import SEOHead from '@/components/SEOHead';
import PremiumPaywall from '@/components/PremiumPaywall';
import { TIER_PRICING } from '@/utils/tiers';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
const BASE_URL = `${SUPABASE_URL}/functions/v1/data-api`;

const FEATURES = [
  {
    icon: LineChart,
    title: 'CFTC COT positioning',
    description: 'Weekly Commitments of Traders reports — managed money, commercials, net position, open interest — up to 5 years of history per commodity.',
  },
  {
    icon: Wheat,
    title: 'EIA / USDA / FRED fundamentals',
    description: 'Supply, demand, and inventory series (e.g. Cushing crude stocks) with week-over-week and year-over-year deltas already computed.',
  },
  {
    icon: Briefcase,
    title: 'Your portfolio & watchlists',
    description: 'Pull your own saved positions and watchlists programmatically — feed them into a spreadsheet, dashboard, or internal tool.',
  },
  {
    icon: ShieldCheck,
    title: 'Built for production use',
    description: 'Per-key auth, 60 req/min per key (not per IP — safe behind a shared server), and rate-limit headers on every response.',
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What does API access cost?',
    a: `API access is included with a Commodity Hub Pro subscription ($${TIER_PRICING.pro.monthly}/mo) — no separate API-only SKU or usage-based billing today. One subscription, unlimited keys, 60 requests/minute per key.`,
  },
  {
    q: 'Do I need the mobile app?',
    a: 'No. Subscribing and creating a key both work entirely from the web — no app install required.',
  },
  {
    q: 'How many API keys can I create?',
    a: 'As many as you need — create one per project or server. Each key is independently rate-limited and independently revocable.',
  },
  {
    q: 'What happens if my subscription lapses?',
    a: 'Existing keys stop authenticating immediately — requests get a 403 pro_required — but nothing is deleted. Resubscribing reactivates the same keys.',
  },
  {
    q: 'Is there a free trial or sandbox?',
    a: 'Not currently. Full request/response shapes for every resource are documented on the reference page below, so you can evaluate the fit before subscribing.',
  },
];

const DataApiLanding: React.FC = () => {
  const navigate = useNavigate();
  const [paywall, setPaywall] = useState(false);

  return (
    <>
      <SEOHead
        title="Data API - Commodity Hub"
        description="Programmatic access to CFTC COT positioning, EIA/USDA/FRED fundamentals, and your own portfolio data. A REST API, one subscription, no usage metering."
        keywords={['commodity data api', 'cot report api', 'commodities api for developers', 'futures positioning api']}
      />

      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl space-y-16 px-4 py-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Commodity Hub
          </Button>

          {/* Hero */}
          <div className="space-y-5 text-center">
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              Commodities data, <span className="text-primary">one API key away</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              CFTC positioning, government fundamentals series, and your own saved market data —
              as a plain REST API. No contracts, no per-call billing, no sales calls.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button size="lg" onClick={() => setPaywall(true)}>
                Get API access <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/developers">Read the docs</Link>
              </Button>
            </div>
          </div>

          {/* Code teaser */}
          <div className="mx-auto max-w-2xl">
            <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-left text-xs leading-relaxed shadow-sm">
              <code>{`curl "${BASE_URL}?resource=cot&commodity=WTI%20Crude%20Oil" \\
  -H "Authorization: Bearer ch_live_..."

{
  "data": [
    { "report_date": "2026-08-19", "managed_money_long": 241382, "net_position": 143171, "..." }
  ],
  "generated_at": "2026-08-27T12:00:00.000Z"
}`}</code>
            </pre>
          </div>

          {/* Features */}
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                  <div className="rounded-md bg-primary/10 p-2">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                    <CardDescription className="mt-1">{f.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* Pricing */}
          <div className="mx-auto max-w-md">
            <Card className="border-primary/40">
              <CardHeader className="text-center">
                <CardTitle className="text-lg">Pro</CardTitle>
                <div className="pt-2">
                  <span className="text-4xl font-bold">${TIER_PRICING.pro.monthly}</span>
                  <span className="text-muted-foreground">/mo</span>
                </div>
                <CardDescription>Annual plans available at checkout.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {[
                    'Unlimited API keys',
                    '60 requests/minute per key',
                    'COT, fundamentals, portfolio & watchlist resources',
                    'Also unlocks the full Commodity Hub Pro app',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" size="lg" onClick={() => setPaywall(true)}>
                  Get API access
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* FAQ */}
          <div className="mx-auto max-w-2xl space-y-4">
            <h2 className="text-center text-2xl font-semibold">Frequently asked</h2>
            <Accordion type="single" collapsible>
              {FAQ.map((item, i) => (
                <AccordionItem value={`item-${i}`} key={item.q}>
                  <AccordionTrigger className="text-left">{item.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            Full reference, resources, and error codes at{' '}
            <Link to="/developers" className="underline">
              /developers
            </Link>
            .
          </div>
        </div>
      </div>

      <PremiumPaywall open={paywall} onOpenChange={setPaywall} source="data_api_landing" />
    </>
  );
};

export default DataApiLanding;
