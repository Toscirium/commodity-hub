import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Landmark, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import TradeCTA from '@/components/trade/TradeCTA';
import { AFFILIATE_PROVIDERS } from '@/config/affiliates';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORY_LABELS: Record<string, string> = {
  energy: 'Energy',
  metals: 'Metals',
  grains: 'Grains',
  livestock: 'Livestock',
  dairy: 'Dairy',
  industrials: 'Industrials',
};

const Trade: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth();
  const isPaidTier = (auth?.tier ?? 'free') !== 'free';
  const { data: commodities = [], isLoading } = useAvailableCommodities({ lightweight: true });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commodities;
    return commodities.filter(
      (c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q),
    );
  }, [commodities, search]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Dashboard
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Trade
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Take a position on where a commodity's price is headed, through independent,
            regulated brokers.
          </p>
        </div>

        {isPaidTier ? (
          // TradeCTA itself already hides for Premium/Pro (see its own
          // comment), so a plain list here would just be a wall of
          // buttonless cards. Swap in an explicit "why you're not seeing
          // ads" card instead — makes good on the "ad-free experience"
          // perk the paywall already advertises, rather than looking broken.
          <Card>
            <CardContent className="pt-6 pb-6 text-center space-y-2">
              <Sparkles className="w-8 h-8 mx-auto text-primary" />
              <h3 className="text-lg font-semibold">No broker ads for subscribers</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                As a {auth?.tier === 'pro' ? 'Pro' : 'Premium'} subscriber you won't see referral
                links to outside brokers here — that's part of the ad-free experience. Thanks for
                supporting Commodity Hub directly.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="mt-2">
                Back to Dashboard
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Trading involves risk of loss</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>
                  CFDs are leveraged/complex products and carry a high risk of
                  losing money rapidly, including more than your initial deposit. You must be 18+ and
                  able to afford this risk before using any link below. Commodity Hub does not execute
                  trades, hold funds, or provide investment advice — every link goes to an independent,
                  licensed third party, and Commodity Hub may earn a referral commission if you sign up.
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-foreground/80">
                  {Object.values(AFFILIATE_PROVIDERS).map((p) => (
                    <span key={p.id}>
                      <strong className="text-foreground">{p.name}</strong> — {p.tagline}.{' '}
                      {p.regionNote}.
                    </span>
                  ))}
                </div>
              </AlertDescription>
            </Alert>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search commodities…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading commodities…</p>
            ) : (
              <div className="space-y-3">
                {filtered.map((c) => (
                  <Card key={c.symbol}>
                    <CardContent className="pt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[c.category] ?? c.category} · {c.venue}
                          {typeof c.price === 'number' && c.price > 0 && (
                            <> · ${c.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</>
                          )}
                        </div>
                      </div>
                      <TradeCTA symbol={c.symbol} commodityName={c.name} />
                    </CardContent>
                  </Card>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground">No commodities match "{search}".</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Trade;
