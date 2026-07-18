import React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Clock, TrendingUp, TrendingDown, Minus, Tag } from 'lucide-react';
import { EnhancedNewsItem } from '@/services/newsHelpers';

interface EnhancedNewsCardProps {
  news: EnhancedNewsItem;
  commodityName: string;
}

const EnhancedNewsCard: React.FC<EnhancedNewsCardProps> = ({ news, commodityName }) => {
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const getSentimentIcon = () => {
    switch (news.sentiment) {
      case 'positive':
        return <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />;
      case 'negative':
        return <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getSentimentColor = () => {
    switch (news.sentiment) {
      case 'positive':
        return 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800';
      case 'negative':
        return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800';
    }
  };

  const getCategoryColor = () => {
    switch (news.category) {
      case 'market_analysis':
        return 'bg-blue-100 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300';
      case 'regulatory':
        return 'bg-orange-100 dark:bg-orange-950/20 text-orange-800 dark:text-orange-300';
      case 'supply_demand':
        return 'bg-purple-100 dark:bg-purple-950/20 text-purple-800 dark:text-purple-300';
      case 'economic':
        return 'bg-indigo-100 dark:bg-indigo-950/20 text-indigo-800 dark:text-indigo-300';
      default:
        return 'bg-gray-100 dark:bg-gray-950/20 text-gray-800 dark:text-gray-300';
    }
  };

  const formatCategory = (category?: string) => {
    if (!category) return 'General';
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <Card className="box-border w-full min-w-0 max-w-full overflow-hidden transition-all duration-200 hover:shadow-lg border-l-4 border-primary/20 hover:border-primary/60">
      <CardHeader className="pb-3 px-3 sm:px-6 min-w-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:gap-3 min-w-0 max-w-full overflow-hidden">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-foreground leading-snug line-clamp-2 mb-2 break-words">
              {news.title}
            </h3>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="max-w-full truncate text-xs">
                {news.source}
              </Badge>
              {news.category && (
                <Badge className={`max-w-full truncate text-xs ${getCategoryColor()}`}>
                  {formatCategory(news.category)}
                </Badge>
              )}
              {news.sentiment && (
                <Badge variant="outline" className={`max-w-full truncate text-xs ${getSentimentColor()}`}>
                  <span className="flex items-center gap-1 min-w-0">
                    {getSentimentIcon()}
                    {news.sentiment}
                  </span>
                </Badge>
              )}
            </div>
          </div>
          {news.urlToImage && (
            <div className="flex-shrink-0 max-w-[3rem] sm:max-w-[4rem]">
              <img 
                src={news.urlToImage} 
                alt={news.title}
                className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3 px-3 sm:px-6 min-w-0 overflow-hidden">
        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-3 leading-relaxed break-words">
          {news.description}
        </p>
        
        {/* Tags */}
        {news.tags && news.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <Tag className="w-3 h-3 text-muted-foreground" />
            {news.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs px-2 py-0.5">
                {tag}
              </Badge>
            ))}
            {news.tags.length > 4 && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                +{news.tags.length - 4}
              </Badge>
            )}
          </div>
        )}
        
        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t flex-wrap min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted-foreground flex-wrap min-w-0 max-w-full overflow-hidden">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{formatTimeAgo(news.publishedAt)}</span>
            {news.author && (
              <>
                <span>•</span>
                <span className="truncate max-w-[120px]">{news.author}</span>
              </>
            )}
            {news.relevanceScore && news.relevanceScore > 0 && (
              <>
                <span>•</span>
                <span className="font-medium text-primary">
                  {Math.round(news.relevanceScore)}% relevant
                </span>
              </>
            )}
          </div>
          
          {news.url && news.url !== '#' && (
            <Button 
              variant="ghost" 
              size="sm" 
              asChild
              className="text-xs h-7 px-2 flex-shrink-0"
            >
              <a 
                href={news.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1"
              >
                Read more
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default EnhancedNewsCard;