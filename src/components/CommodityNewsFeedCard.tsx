import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NEWS_CATEGORY_LABELS, type CommodityNewsItem } from '@/hooks/useCommodityNewsFeed';
import { openExternalUrl } from '@/utils/openExternalUrl';

const formatTimeAgo = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
};

interface CommodityNewsFeedCardProps {
  item: CommodityNewsItem;
}

const CommodityNewsFeedCard: React.FC<CommodityNewsFeedCardProps> = ({ item }) => {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <button
          type="button"
          onClick={() => void openExternalUrl(item.url)}
          className="block w-full text-left"
        >
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge variant="secondary" className="text-[11px] font-medium">
              {NEWS_CATEGORY_LABELS[item.category]}
            </Badge>
            <span className="text-xs text-muted-foreground">{item.source_name}</span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{formatTimeAgo(item.published_at)}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-medium text-sm leading-snug">{item.title}</h3>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          </div>
          {item.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{item.description}</p>
          )}
        </button>
      </CardContent>
    </Card>
  );
};

export default CommodityNewsFeedCard;
