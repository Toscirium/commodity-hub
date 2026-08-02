import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Landmark, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import TradeCTA from '@/components/trade/TradeCTA';
import { AFFILIATE_PROVIDERS } from '@/config/affiliates';

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

        <Card className="mb-6 border-dashed">
          <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
            <p>
              Commodity Hub is a price-tracking and analytics app — it does not execute trades,
              hold funds, or provide investment advice. The links below take you to independent
              third parties who are licensed to offer these products in their respective regions.
              Commodity Hub may earn a referral commission if you sign up through them.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 pt-1">
              {Object.values(AFFILIATE_PROVIDERS).map((p) => (
                <span key={p.id}>
                  <strong className="text-foreground">{p.name}</strong> — {p.tagline}.{' '}
                  {p.regionNote}.
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

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
      </div>
    </div>
  );
};

export default Trade;
