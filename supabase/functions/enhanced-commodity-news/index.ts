import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'

// Protects NewsAPI + Marketaux daily quotas.
const limiter = new IpRateLimiter({ limit: 20, windowMs: 60_000 });

interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  urlToImage?: string;
  category?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const ip = IpRateLimiter.getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: 'Rate limit exceeded' }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(rl.retryAfterSeconds),
        },
      }
    );
  }

  try {
    console.log('Enhanced commodity news function called');
    const body = await req.json();
    
    // Input validation
    const commodity = typeof body.commodity === 'string' && body.commodity.length > 0 && body.commodity.length <= 100
      ? body.commodity.replace(/[^a-zA-Z0-9\s-]/g, '')
      : null;
    const validSources = ['all', 'marketaux', 'news'];
    const source = validSources.includes(body.source) ? body.source : 'all';
    
    console.log('Request params:', { commodity, source });
    
    if (!commodity) {
      throw new Error('Commodity parameter is required and must be a valid string');
    }

    const newsApiKey = Deno.env.get('NEWS_API_KEY');
    const marketauxApiKey = Deno.env.get('MARKETAUX_API_KEY');
    
    const articles: NewsItem[] = [];

    // Try Marketaux API first (financial news aggregator)
    if (source === 'marketaux' || source === 'all') {
      if (marketauxApiKey && marketauxApiKey !== 'demo') {
        try {
          const symbols = getCommoditySymbols(commodity);
          const marketauxResponse = await fetch(
            `https://api.marketaux.com/v1/news/all?symbols=${symbols}&filter_entities=true&language=en&api_token=${marketauxApiKey}&limit=15`
          );
          
          if (marketauxResponse.ok) {
            const marketauxData = await marketauxResponse.json();
            if (marketauxData.data && Array.isArray(marketauxData.data)) {
              const marketauxArticles = marketauxData.data.map((article: any, index: number) => ({
                id: `marketaux_${commodity}_${index}_${Date.now()}`,
                title: article.title || `${commodity} Market Update`,
                description: article.description || article.snippet || `Latest analysis for ${commodity}`,
                url: article.url || generateCommodityUrl(commodity, 'marketwatch'),
                source: article.source || 'Marketaux',
                publishedAt: article.published_at || new Date().toISOString(),
                urlToImage: article.image_url,
                category: categorizeCommodityNews(article.title, article.description, commodity)
              }));
              articles.push(...marketauxArticles);
            }
          }
        } catch (error) {
          console.warn('Marketaux API failed:', error);
        }
      }
    }

    // FMP source removed — see mem://integrations/commoditypriceapi-config

    // Try News API as fallback
    if (articles.length < 5 && newsApiKey) {
      try {
        const query = buildCommodityQuery(commodity);
        const newsResponse = await fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&sortBy=publishedAt&pageSize=15&language=en&apiKey=${newsApiKey}`
        );
        
        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          if (newsData.articles && Array.isArray(newsData.articles)) {
            const newsArticles = newsData.articles
              .filter((article: any) => article.title && article.description && article.url)
              .map((article: any, index: number) => ({
                id: `news_${commodity}_${index}_${Date.now()}`,
                title: article.title,
                description: article.description,
                url: article.url,
                source: article.source?.name || 'News',
                publishedAt: article.publishedAt,
                urlToImage: article.urlToImage,
                category: categorizeCommodityNews(article.title, article.description, commodity)
              }));
            articles.push(...newsArticles);
          }
        }
      } catch (error) {
        console.warn('News API failed:', error);
      }
    }

    // Remove duplicates and sort by relevance
    const uniqueArticles = removeDuplicates(articles);
    const sortedArticles = sortByRelevance(uniqueArticles, commodity).slice(0, 20);

    // Deliberately no fallback: an empty list is the honest answer when
    // neither provider had anything. See REMOVED note at the bottom of this
    // file. Clients render their own "no recent news" state.
    console.log('Returning articles:', sortedArticles.length);
    return new Response(
      JSON.stringify({ articles: sortedArticles, source: 'enhanced' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in enhanced commodity news:', error);

    return new Response(
      JSON.stringify({ articles: [], source: 'error', error: 'Failed to fetch news' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper functions
function getCommoditySymbols(commodity: string): string {
  const symbolMap: Record<string, string> = {
    'Gold Futures': 'GOLD,GLD,IAU',
    'Silver Futures': 'SILVER,SLV',
    'Copper': 'COPPER,FCX',
    'WTI Crude Oil': 'OIL,USO,UCO,CL',
    'Natural Gas': 'NATGAS,UNG',
    'Corn Futures': 'CORN',
    'Wheat Futures': 'WHEAT',
    'Soybean Futures': 'SOYB'
  };
  return symbolMap[commodity] || commodity.replace(/\s+/g, '').toUpperCase();
}

function buildCommodityQuery(commodity: string): string {
  const baseQuery = commodity.toLowerCase();
  const additionalTerms = {
    'Gold': 'gold price precious metals',
    'Silver': 'silver price precious metals',
    'Copper': 'copper price industrial metals',
    'WTI Crude Oil': 'crude oil price petroleum WTI Brent',
    'Natural Gas': 'natural gas price energy',
    'Corn': 'corn price agriculture grain',
    'Wheat': 'wheat price agriculture grain',
    'Soybeans': 'soybeans price agriculture grain'
  };
  
  return additionalTerms[commodity as keyof typeof additionalTerms] || `${baseQuery} commodity price market`;
}

function isRelevantToCommodity(title: string, content: string, commodity: string): boolean {
  const text = `${title} ${content}`.toLowerCase();
  const commodityLower = commodity.toLowerCase();
  
  if (text.includes(commodityLower)) return true;
  
  const relatedTerms: Record<string, string[]> = {
    'gold': ['precious metal', 'bullion', 'xau'],
    'silver': ['precious metal', 'bullion', 'xag'],
    'copper': ['industrial metal', 'mining'],
    'wti crude oil': ['oil', 'petroleum', 'crude', 'wti', 'brent'],
    'natural gas': ['lng', 'gas price', 'energy'],
    'corn': ['grain', 'agriculture', 'crop'],
    'wheat': ['grain', 'agriculture', 'crop'],
    'soybeans': ['grain', 'agriculture', 'crop', 'soy']
  };
  
  const terms = relatedTerms[commodityLower] || [];
  return terms.some(term => text.includes(term)) || 
         text.includes('commodity') || 
         text.includes('market') || 
         text.includes('trading');
}

function categorizeCommodityNews(title: string, content: string, commodity: string): string {
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
}

function generateCommodityUrl(commodity: string, source: string): string {
  const commoditySlug = commodity.toLowerCase().replace(/\s+/g, '-');
  const urls = {
    'marketwatch': `https://www.marketwatch.com/investing/commodity/${commoditySlug}`,
    'reuters': `https://www.reuters.com/markets/commodities/${commoditySlug}`,
    'bloomberg': `https://www.bloomberg.com/markets/commodities/${commoditySlug}`,
    'ft': `https://www.ft.com/markets/${commoditySlug}`
  };
  return urls[source as keyof typeof urls] || `https://www.marketwatch.com/investing/commodities`;
}

function removeDuplicates(articles: NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return articles.filter(article => {
    const key = article.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByRelevance(articles: NewsItem[], commodity: string): NewsItem[] {
  return articles.sort((a, b) => {
    const aScore = calculateRelevanceScore(a, commodity);
    const bScore = calculateRelevanceScore(b, commodity);
    
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}

function calculateRelevanceScore(article: NewsItem, commodity: string): number {
  let score = 0;
  const text = `${article.title} ${article.description}`.toLowerCase();
  const commodityLower = commodity.toLowerCase();
  
  if (article.title.toLowerCase().includes(commodityLower)) score += 15;
  if (article.description.toLowerCase().includes(commodityLower)) score += 10;
  if (text.includes('price')) score += 5;
  if (text.includes('market')) score += 3;
  if (text.includes('trading')) score += 3;
  
  const daysSincePublished = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSincePublished <= 1) score += 10;
  else if (daysSincePublished <= 7) score += 5;
  
  return score;
}


// REMOVED 2026-08-26: generateFallbackNews().
//
// It returned four invented articles bylined 'MarketWatch' / 'Reuters' /
// 'Bloomberg' / 'CNBC' whenever neither Marketaux nor NewsAPI had anything
// for a commodity. Verified live before removal: Rough Rice, Class III Milk
// and Orange Juice — all Premium-unlock commodities — were serving nothing
// but these to paying subscribers.
//
// Returning an empty list is the honest answer; clients already render a
// "No Recent News" state for it. See the fuller note in
// src/services/newsHelpers.ts, where the client-side twin was removed.
