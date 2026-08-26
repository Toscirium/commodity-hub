import { NewsItem } from './commodityApi';
import { supabase } from '@/integrations/supabase/client';

// Enhanced news source interfaces
interface NewsSourceConfig {
  name: string;
  priority: number;
  maxArticles: number;
  enabled: boolean;
}

// Enhanced news item with sentiment and category
export interface EnhancedNewsItem extends NewsItem {
  sentiment?: 'positive' | 'negative' | 'neutral';
  category?: 'market_analysis' | 'regulatory' | 'supply_demand' | 'economic' | 'general';
  relevanceScore?: number;
  tags?: string[];
  author?: string;
}

const NEWS_SOURCES: Record<string, NewsSourceConfig> = {
  marketaux: { name: 'Marketaux', priority: 1, maxArticles: 12, enabled: true },
};

// Utility functions first
const getCommoditySymbols = (commodityName: string): string => {
  const symbolMap: Record<string, string> = {
    'Gold Futures': 'GOLD,GLD,IAU',
    'Silver Futures': 'SILVER,SLV',
    'Copper': 'COPPER,FCX',
    'WTI Crude Oil': 'OIL,USO,UCO',
    'Natural Gas': 'NATGAS,UNG',
    'Corn Futures': 'CORN',
    'Wheat Futures': 'WHEAT',
    'Soybean Futures': 'SOYB'
  };
  return symbolMap[commodityName] || commodityName.replace(/\s+/g, '').toUpperCase();
};

const buildEnhancedNewsQuery = (commodityName: string): string => {
  return buildNewsQuery(commodityName);
};

const getCommodityTicker = (commodityName: string): string => {
  const tickerMap: Record<string, string> = {
    'Gold Futures': 'GLD',
    'Silver Futures': 'SLV', 
    'WTI Crude Oil': 'USO',
    'Natural Gas': 'UNG'
  };
  return tickerMap[commodityName] || 'SPY'; // fallback
};

// Enhanced analysis functions
const analyzeSentiment = (title: string, content: string): 'positive' | 'negative' | 'neutral' => {
  const text = `${title} ${content}`.toLowerCase();
  
  const positiveWords = ['rise', 'rising', 'increase', 'bull', 'bullish', 'up', 'gain', 'gains', 'surge', 'soar'];
  const negativeWords = ['fall', 'falling', 'decline', 'bear', 'bearish', 'down', 'loss', 'losses', 'plunge', 'drop'];
  
  let positiveScore = 0;
  let negativeScore = 0;
  
  positiveWords.forEach(word => {
    if (text.includes(word)) positiveScore++;
  });
  
  negativeWords.forEach(word => {
    if (text.includes(word)) negativeScore++;
  });
  
  if (positiveScore > negativeScore + 1) return 'positive';
  if (negativeScore > positiveScore + 1) return 'negative';
  return 'neutral';
};

const categorizeNews = (title: string, content: string, commodityName: string): 'market_analysis' | 'regulatory' | 'supply_demand' | 'economic' | 'general' => {
  const text = `${title} ${content}`.toLowerCase();
  
  if (text.includes('regulation') || text.includes('policy') || text.includes('government')) {
    return 'regulatory';
  }
  if (text.includes('supply') || text.includes('demand') || text.includes('production')) {
    return 'supply_demand';
  }
  if (text.includes('analysis') || text.includes('forecast') || text.includes('outlook')) {
    return 'market_analysis';
  }
  if (text.includes('economy') || text.includes('gdp') || text.includes('inflation')) {
    return 'economic';
  }
  return 'general';
};

const extractTags = (title: string, content: string, commodityName: string): string[] => {
  const text = `${title} ${content}`.toLowerCase();
  const tags: string[] = [];
  
  if (text.includes('bullish')) tags.push('bullish');
  if (text.includes('bearish')) tags.push('bearish');
  if (text.includes('breaking')) tags.push('breaking');
  if (text.includes('volatility')) tags.push('volatility');
  
  return tags;
};

const calculateEnhancedRelevanceScore = (article: any, commodityName: string): number => {
  let score = 0;
  const title = (article.title || '').toLowerCase();
  const content = (article.description || article.text || '').toLowerCase();
  const commodity = commodityName.toLowerCase();
  
  if (title.includes(commodity)) score += 20;
  if (content.includes(commodity)) score += 15;
  
  // Time relevance
  const publishedTime = new Date(article.published_at || article.publishedAt || Date.now()).getTime();
  const hoursAgo = (Date.now() - publishedTime) / (1000 * 60 * 60);
  
  if (hoursAgo <= 1) score += 10;
  else if (hoursAgo <= 24) score += 5;
  
  return score;
};

// Enhanced news fetching using Supabase edge function
export const fetchNewsFromMarketaux = async (commodityName: string): Promise<EnhancedNewsItem[]> => {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-commodity-news', {
      body: { commodity: commodityName, source: 'marketaux' }
    });

    if (error || !data?.articles) {
      console.warn('Marketaux edge function failed:', error);
      return [];
    }

    return data.articles.map((article: any, index: number) => ({
      id: `marketaux_${commodityName}_${index}_${Date.now()}`,
      title: article.title || `${commodityName} Market Update`,
      description: article.description || article.snippet || `Latest market analysis for ${commodityName}`,
      url: article.url || `https://www.marketwatch.com/investing/commodity/${commodityName.toLowerCase()}`,
      source: article.source || 'Marketaux',
      publishedAt: article.publishedAt || new Date().toISOString(),
      urlToImage: article.urlToImage,
      sentiment: analyzeSentiment(article.title, article.description),
      category: categorizeNews(article.title, article.description, commodityName),
      relevanceScore: calculateEnhancedRelevanceScore(article, commodityName),
      tags: extractTags(article.title, article.description, commodityName),
      author: article.author
    }));
  } catch (error) {
    console.warn('Marketaux edge function failed:', error);
    return [];
  }
};

const buildNewsQuery = (commodityName: string): string => {
  const baseQuery = commodityName.toLowerCase();
  const additionalTerms = {
    'Gold': 'gold price precious metals',
    'Silver': 'silver price precious metals',
    'Copper': 'copper price industrial metals',
    'WTI Crude': 'crude oil WTI petroleum',
    'Brent Crude': 'brent crude oil petroleum',
    'Natural Gas': 'natural gas energy',
    'Corn': 'corn agriculture grain',
    'Wheat': 'wheat agriculture grain',
    'Soybeans': 'soybeans agriculture grain'
  };
  
  return additionalTerms[commodityName as keyof typeof additionalTerms] || `${baseQuery} commodity market`;
};

const isRelevantToCommodity = (title: string, content: string, commodityName: string): boolean => {
  const text = `${title} ${content}`.toLowerCase();
  const commodity = commodityName.toLowerCase();
  
  if (text.includes(commodity)) return true;
  
  const relatedTerms: Record<string, string[]> = {
    'gold': ['precious metal', 'bullion', 'xau'],
    'silver': ['precious metal', 'bullion', 'xag'],
    'copper': ['industrial metal', 'mining'],
    'wti crude': ['oil', 'petroleum', 'crude', 'wti'],
    'brent crude': ['oil', 'petroleum', 'crude', 'brent'],
    'natural gas': ['lng', 'gas price', 'energy'],
    'corn': ['grain', 'agriculture', 'crop'],
    'wheat': ['grain', 'agriculture', 'crop'],
    'soybeans': ['grain', 'agriculture', 'crop', 'soy']
  };
  
  const terms = relatedTerms[commodity] || [];
  return terms.some(term => text.includes(term)) || 
         text.includes('commodity') || 
         text.includes('market') || 
         text.includes('trading');
};

export const removeDuplicateNews = (news: NewsItem[]): NewsItem[] => {
  const seen = new Set<string>();
  return news.filter(item => {
    const key = item.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const sortNewsByRelevance = (news: NewsItem[], commodityName: string): NewsItem[] => {
  return news.sort((a, b) => {
    const aRelevance = calculateRelevanceScore(a, commodityName);
    const bRelevance = calculateRelevanceScore(b, commodityName);
    
    if (aRelevance !== bRelevance) {
      return bRelevance - aRelevance;
    }
    
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
};

const calculateRelevanceScore = (newsItem: NewsItem, commodityName: string): number => {
  let score = 0;
  const text = `${newsItem.title} ${newsItem.description}`.toLowerCase();
  const commodity = commodityName.toLowerCase();
  
  if (newsItem.title.toLowerCase().includes(commodity)) score += 10;
  if (newsItem.description.toLowerCase().includes(commodity)) score += 5;
  if (text.includes('price')) score += 3;
  if (text.includes('market')) score += 2;
  if (text.includes('trading')) score += 2;
  if (text.includes('commodity')) score += 3;
  
  const daysSincePublished = (Date.now() - new Date(newsItem.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublished <= 7) score += 2;

  return score;
};

// REMOVED 2026-08-26: getFallbackNews().
//
// It returned twelve template-generated articles — invented headlines and
// summaries — each stamped with `source: 'Reuters' | 'Bloomberg' | 'Wall
// Street Journal' | 'Financial Times' | 'CNBC' | 'MarketWatch'` and linked
// to those outlets' generic commodity sections. Anything that couldn't be
// served real news rendered them as if those newsrooms had written them.
//
// This was live in production and reachable by paying subscribers: verified
// against the deployed enhanced-commodity-news function, Rough Rice, Class
// III Milk and Orange Juice (all Premium-unlock commodities) each returned
// four fabricated articles under real outlets' bylines. Fabricated market
// commentary attributed to a real financial wire is a credibility and
// trademark problem, and a much larger one in a finance app than an empty
// news panel ever was.
//
// commodityApi.ts already held the right rule for prices — "Never
// manufacture a quote. Callers render their explicit unavailable state." —
// and this is the same rule applied to news. Callers now show their empty
// state (CommodityNews.tsx renders "No Recent News"), which is honest.
//
// The matching fallbacks in supabase/functions/enhanced-commodity-news and
// fetch-commodity-news were removed at the same time; leaving either in
// place would have kept serving fabrications through the edge function even
// with this one gone.
