import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, LineChart, Wheat, Briefcase, ShieldCheck, ArrowRight, Check } from 'lucide-react';
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
    icon: TrendingUp,
    title: 'Live & historical prices',
    description: 'Current price for any commodity, or a full historical chart (1d to 2y) — the same feed the app itself runs on.',
  },
  {
    icon: LineChart,
    title: 'CFTC COT positioning',
    description: 'Weekly Commitments of Traders reports — managed money, commercials, net position, open interest — up to 10 years of history per commodity.',
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
    a: `Nothing to start — sign in and create a free key, no card required. Pro ($${TIER_PRICING.pro.monthly}/mo) removes the free tier's caps and unlocks the full app. Neither tier bills per request — there's no usage-based metering at all.`,
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — 1 key, 50 requests/day, every resource available. Enough to actually build and test an integration before paying anything.',
  },
  {
    q: 'Do I need the mobile app?',
    a: 'No. Signing in, creating a key, and subscribing to Pro all work entirely from the web — no app install required.',
  },
  {
    q: 'How many API keys can I create?',
    a: 'Free accounts: 1. Pro: as many as you need — one per project or server. Each key is independently rate-limited and independently revocable.',
  },
  {
    q: 'What happens if my subscription lapses?',
    a: "Existing keys keep working, but fall back to the free tier's 50 requests/day cap instead of Pro's unlimited — nothing is deleted, and resubscribing removes the cap again immediately.",
  },
];

const DataApiLanding: React.FC = () => {
  const navigate = useNavigate();
  const [paywall, setPaywall] = useState(false);

  return (
    <>
      <SEOHead
        title="Data API - Commodity Hub"
        description="Live prices, CFTC COT positioning, EIA/USDA/FRED fundamentals, and your own portfolio data. A REST API with a free tier and no per-request billing at any tier."
        keywords={['commodity data api', 'commodity price api', 'cot report api', 'commodities api for developers', 'futures positioning api']}
      />

      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-5xl space-y-16 px-4 py-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Commodity Hub
          </Button>

          {/* Hero */}
          <div className="space-y-5 text-center">
            <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
              Commodities data, <span className="text-primary">no per-request billing</span>
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              Live prices, CFTC positioning, government fundamentals, and your own saved market
              data — as a plain REST API. Start free, no card required; Pro is a flat $
              {TIER_PRICING.pro.monthly}/mo with no metering, ever — not $0.001/call like most of
              the field.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Button size="lg" asChild>
                <Link to="/exports">
                  Get a free key <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/developers">Read the docs</Link>
              </Button>
            </div>
          </div>

          {/* Code teaser */}
          <div className="mx-auto max-w-2xl">
            <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-left text-xs leading-relaxed shadow-sm">
              <code>{`curl "${BASE_URL}?resource=prices&commodity=WTI%20Crude%20Oil" \\
  -H "Authorization: Bearer ch_live_..."

{
  "data": { "symbol": "CL", "name": "WTI Crude Oil", "price": 80.32, "change": -0.41 },
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
          <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-lg">Free</CardTitle>
                <div className="pt-2">
                  <span className="text-4xl font-bold">$0</span>
                </div>
                <CardDescription>No card required.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2 text-sm">
                  {[
                    '1 API key',
                    '50 requests/day',
                    'Every resource — prices, COT, fundamentals, portfolio, watchlists',
                    'No time limit — stays free as long as you want',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" size="lg" variant="outline" asChild>
                  <Link to="/exports">Get a free key</Link>
                </Button>
              </CardContent>
            </Card>
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
                    '60 requests/minute per key, no monthly cap',
                    'Same resources as Free',
                    'Also unlocks the full Commodity Hub Pro app',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button className="w-full" size="lg" onClick={() => setPaywall(true)}>
                  Upgrade to Pro
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
