import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Matches the taxonomy the refresh-commodity-news-feed edge function tags
// every row with (see supabase/functions/refresh-commodity-news-feed/rss.ts).
export type NewsCategory =
  | 'energy'
  | 'metals'
  | 'grains'
  | 'livestock'
  | 'softs'
  | 'economic'
  | 'geopolitical'
  | 'general';

export interface CommodityNewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source_name: string;
  category: NewsCategory;
  published_at: string;
}

const FEED_LIMIT = 100;
// Module-level (not recreated per render) so the realtime effect below can
// invalidate the exact same query the useQuery call registers, without
// needing it in the effect's dependency array.
const QUERY_KEY = ['commodity-news-feed'] as const;

/**
 * Reads the Premium/Pro-gated commodity_news_feed table (RLS enforces the
 * tier check server-side — a free-tier caller just gets zero rows back, not
 * an error) and subscribes to live inserts so an open tab picks up new
 * articles the moment the cron-refreshed table changes, no manual refresh.
 */
export const useCommodityNewsFeed = () => {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CommodityNewsItem[]> => {
      const { data, error } = await supabase
        .from('commodity_news_feed')
        .select('id, title, description, url, source_name, category, published_at')
        .order('published_at', { ascending: false })
        .limit(FEED_LIMIT);
      if (error) throw error;
      return (data ?? []) as CommodityNewsItem[];
    },
  });

  React.useEffect(() => {
    const channel = supabase
      .channel('commodity_news_feed_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commodity_news_feed' }, () => {
        void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
};

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  energy: 'Energy',
  metals: 'Metals',
  grains: 'Grains',
  livestock: 'Livestock',
  softs: 'Softs',
  economic: 'Economic',
  geopolitical: 'Geopolitical',
  general: 'General',
};
