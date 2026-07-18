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

export const getFallbackNews = (commodityName: string): EnhancedNewsItem[] => {
  const today = new Date();
  const baseTime = today.getTime();
  const commoditySlug = commodityName.toLowerCase().replace(/\s+/g, '-');
  
  const fallbackArticles = [
    {
      id: `${commodityName}_fallback_1`,
      title: `${commodityName} prices surge amid global supply chain disruptions and economic uncertainty`,
      description: `Recent geopolitical tensions and supply chain challenges are creating significant volatility in ${commodityName} markets, with analysts predicting continued price fluctuations in the coming months.`,
      url: `https://www.marketwatch.com/investing/commodity/${commoditySlug}`,
      source: 'MarketWatch',
      publishedAt: new Date(baseTime - 1 * 60 * 60 * 1000).toISOString(),
      sentiment: 'positive' as const,
      category: 'supply_demand' as const,
      relevanceScore: 85,
      tags: ['volatility', 'bullish']
    },
    {
      id: `${commodityName}_fallback_2`,
      title: `Federal Reserve policy changes impact ${commodityName.toLowerCase()} market outlook significantly`,
      description: `Central bank monetary policy adjustments are creating new dynamics in commodity markets, with ${commodityName} showing increased sensitivity to interest rate changes and inflation expectations.`,
      url: `https://www.reuters.com/markets/commodities/${commoditySlug}`,
      source: 'Reuters',
      publishedAt: new Date(baseTime - 2 * 60 * 60 * 1000).toISOString(),
      sentiment: 'neutral' as const,
      category: 'economic' as const,
      relevanceScore: 80,
      tags: ['economic']
    },
    {
      id: `${commodityName}_fallback_3`,
      title: `Global demand shifts create unprecedented volatility in ${commodityName.toLowerCase()} trading`,
      description: `International market dynamics and changing consumption patterns are driving significant price movements in ${commodityName}, with emerging markets playing an increasingly important role in price discovery.`,
      url: `https://finance.yahoo.com/topic/commodities`,
      source: 'Bloomberg',
      publishedAt: new Date(baseTime - 3 * 60 * 60 * 1000).toISOString(),
      sentiment: 'neutral' as const,
      category: 'market_analysis' as const,
      relevanceScore: 75,
      tags: ['volatility']
    },
    {
      id: `${commodityName}_fallback_4`,
      title: `New regulatory framework could reshape ${commodityName.toLowerCase()} market structure`,
      description: `Upcoming regulatory changes and compliance requirements are expected to impact how ${commodityName} is traded and priced, with industry experts calling for enhanced market transparency.`,
      url: `https://www.wsj.com/markets/commodities`,
      source: 'Financial Times',
      publishedAt: new Date(baseTime - 4 * 60 * 60 * 1000).toISOString(),
      sentiment: 'neutral' as const,
      category: 'regulatory' as const,
      relevanceScore: 70,
      tags: []
    },
    {
      id: `${commodityName}_fallback_5`,
      title: `Technical analysis suggests ${commodityName} may break key resistance levels`,
      description: `Chart patterns and technical indicators are pointing to potential breakout scenarios for ${commodityName}, with traders closely monitoring support and resistance levels for entry signals.`,
      url: `https://www.marketwatch.com/investing/commodities`,
      source: 'TradingView',
      publishedAt: new Date(baseTime - 5 * 60 * 60 * 1000).toISOString(),
      sentiment: 'positive' as const,
      category: 'market_analysis' as const,
      relevanceScore: 68,
      tags: ['bullish']
    },
    {
      id: `${commodityName}_fallback_6`,
      title: `Weather patterns affecting ${commodityName.toLowerCase()} supply forecasts globally`,
      description: `Climate conditions and seasonal weather patterns are influencing production estimates for ${commodityName}, with meteorologists predicting potential supply constraints in key producing regions.`,
      url: `https://www.cnbc.com/commodities/`,
      source: 'CNBC',
      publishedAt: new Date(baseTime - 6 * 60 * 60 * 1000).toISOString(),
      sentiment: 'negative' as const,
      category: 'supply_demand' as const,
      relevanceScore: 65,
      tags: []
    },
    {
      id: `${commodityName}_fallback_7`,
      title: `Institutional investors increase ${commodityName.toLowerCase()} allocations amid inflation hedge`,
      description: `Major pension funds and institutional investors are boosting their ${commodityName} positions as a hedge against inflation, driving increased demand in both spot and futures markets.`,
      url: `https://www.reuters.com/markets/commodities/`,
      source: 'Wall Street Journal',
      publishedAt: new Date(baseTime - 7 * 60 * 60 * 1000).toISOString(),
      sentiment: 'positive' as const,
      category: 'economic' as const,
      relevanceScore: 63,
      tags: ['bullish']
    },
    {
      id: `${commodityName}_fallback_8`,
      title: `Energy transition impacts ${commodityName.toLowerCase()} demand projections long-term`,
      description: `The global shift toward renewable energy and sustainable practices is reshaping demand forecasts for ${commodityName}, with analysts revising long-term price targets accordingly.`,
      url: `https://www.bloomberg.com/markets/commodities/`,
      source: 'Reuters',
      publishedAt: new Date(baseTime - 8 * 60 * 60 * 1000).toISOString(),
      sentiment: 'neutral' as const,
      category: 'market_analysis' as const,
      relevanceScore: 60,
      tags: []
    },
    {
      id: `${commodityName}_fallback_9`,
      title: `Emerging market demand drives ${commodityName.toLowerCase()} price momentum higher`,
      description: `Strong economic growth in developing countries is boosting consumption of ${commodityName}, creating upward pressure on prices as global supply chains adapt to changing demand patterns.`,
      url: 'https://www.bloomberg.com/markets/commodities',
      source: 'Bloomberg',
      publishedAt: new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString(),
      sentiment: 'positive' as const,
      category: 'supply_demand' as const,
      relevanceScore: 58,
      tags: ['bullish']
    },
    {
      id: `${commodityName}_fallback_10`,
      title: `Currency fluctuations add complexity to ${commodityName.toLowerCase()} pricing dynamics`,
      description: `Dollar strength and cross-currency volatility are creating additional pricing pressures for ${commodityName}, with traders factoring in exchange rate risks when making investment decisions.`,
      url: 'https://www.ft.com/markets',
      source: 'Financial Times',
      publishedAt: new Date(today.getTime() - 10 * 60 * 60 * 1000).toISOString(),
      sentiment: 'neutral' as const,
      category: 'economic' as const,
      relevanceScore: 55,
      tags: ['volatility']
    },
    {
      id: `${commodityName}_fallback_11`,
      title: `Production cuts announcement sends ${commodityName.toLowerCase()} futures soaring`,
      description: `Major producing countries announce coordinated production reductions for ${commodityName}, triggering immediate rally in futures markets as supply concerns intensify among traders.`,
      url: 'https://www.cnbc.com/commodities',
      source: 'CNBC',
      publishedAt: new Date(today.getTime() - 11 * 60 * 60 * 1000).toISOString(),
      sentiment: 'positive' as const,
      category: 'supply_demand' as const,
      relevanceScore: 90,
      tags: ['breaking', 'bullish']
    },
    {
      id: `${commodityName}_fallback_12`,
      title: `${commodityName} inventory levels reach critical thresholds amid strong demand`,
      description: `Global stockpiles of ${commodityName} have fallen to multi-year lows as consumption outpaces production, raising concerns about potential supply shortages in key markets worldwide.`,
      url: 'https://www.wsj.com/markets/commodities',
      source: 'Wall Street Journal',
      publishedAt: new Date(today.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      sentiment: 'negative' as const,
      category: 'supply_demand' as const,
      relevanceScore: 88,
      tags: ['bearish']
    }
  ];
  
  return fallbackArticles;
};
