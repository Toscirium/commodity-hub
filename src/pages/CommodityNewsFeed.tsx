import React from 'react';
import { Newspaper, RefreshCw } from 'lucide-react';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PremiumPaywall from '@/components/PremiumPaywall';
import CommodityNewsFeedCard from '@/components/CommodityNewsFeedCard';
import { useAuth } from '@/contexts/AuthContext';
import { useCommodityNewsFeed, NEWS_CATEGORY_LABELS, type NewsCategory } from '@/hooks/useCommodityNewsFeed';

const CommodityNewsFeed: React.FC = () => {
  const auth = useAuth();
  const isPaid = auth?.isPremium ?? false;
  const [paywallOpen, setPaywallOpen] = React.useState(false);
  const [category, setCategory] = React.useState<NewsCategory | 'all'>('all');
  const { data: items, isLoading, isError, refetch, isFetching } = useCommodityNewsFeed();

  if (!isPaid) {
    return (
      <div className="min-h-screen bg-background">
        <MobilePageHeader title="Market News" subtitle="Live commodities news, curated for subscribers" />
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Card className="border-primary/30">
            <CardHeader>
              <Newspaper className="w-8 h-8 text-primary mb-2" />
              <CardTitle>Live commodities news is a Premium &amp; Pro feature</CardTitle>
              <CardDescription>
                A continuously updated feed of energy, metals and agriculture news from EIA, USDA,
                OilPrice.com, Mining.com and Hellenic Shipping News — filterable by category, updating
                live as new articles come in.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setPaywallOpen(true)}>Upgrade to unlock</Button>
            </CardContent>
          </Card>
        </div>
        <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} source="market_news" />
      </div>
    );
  }

  const filtered = category === 'all' ? items : (items ?? []).filter((item) => item.category === category);

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader title="Market News" subtitle="Live commodities news from energy, metals and agriculture sources">
        <Button variant="ghost" size="icon" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </MobilePageHeader>

      <div className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        <Select value={category} onValueChange={(value) => setCategory(value as NewsCategory | 'all')}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.entries(NEWS_CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        )}

        {isError && !isLoading && (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Couldn't load the news feed.</p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && filtered?.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              {category === 'all'
                ? 'No articles yet — check back shortly.'
                : `No ${NEWS_CATEGORY_LABELS[category as NewsCategory].toLowerCase()} articles right now.`}
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && filtered && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((item) => (
              <CommodityNewsFeedCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommodityNewsFeed;
