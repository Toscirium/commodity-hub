import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'

// NewsAPI free tier ≈ 100 req/day — strict per-IP limiting required.
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

const commodityKeywords = [
  // Direct commodity terms
  'commodity', 'commodities', 'trading', 'futures', 'market', 'price',
  'gold', 'silver', 'oil', 'crude', 'natural gas', 'copper', 'platinum',
  'wheat', 'corn', 'soybeans', 'cattle', 'coffee', 'sugar', 'cotton',
  'agriculture', 'metals', 'energy', 'livestock', 'grains',
  
  // Economic indicators affecting commodities
  'inflation', 'deflation', 'GDP', 'economic growth', 'recession',
  'interest rates', 'federal reserve', 'central bank', 'monetary policy',
  'unemployment', 'employment data', 'consumer price index', 'CPI',
  'producer price index', 'PPI', 'economic data', 'economic indicators',
  
  // International affairs affecting markets
  'geopolitical', 'sanctions', 'trade war', 'trade deal', 'tariffs',
  'supply chain', 'shipping', 'logistics', 'export', 'import',
  'OPEC', 'cartel', 'production cut', 'mining', 'drilling',
  
  // Weather and climate (major commodity price drivers)
  'drought', 'flooding', 'weather', 'climate', 'harvest', 'crop yield',
  'natural disaster', 'hurricane', 'typhoon', 'frost',
  
  // Currency and global economics
  'dollar', 'USD', 'currency', 'exchange rate', 'emerging markets',
  'China economy', 'European economy', 'global economy', 'world bank',
  'IMF', 'international monetary fund'
];

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
    const { category = 'all' } = await req.json();
    
    // Get News API key from Supabase secrets
    const newsApiKey = Deno.env.get('NEWS_API_KEY');
    
    if (!newsApiKey) {
      console.error('NEWS_API_KEY not found in environment variables');
      // Return fallback news data
      const fallbackNews: NewsItem[] = [
        {
          id: '1',
          title: 'Global Oil Prices Rise Amid Supply Concerns',
          description: 'Crude oil prices increased by 2% as supply chain disruptions continue to affect global markets.',
          url: '#',
          source: 'Market News',
          publishedAt: new Date().toISOString(),
          category: 'energy'
        },
        {
          id: '2',
          title: 'Gold Futures Hit Monthly High',
          description: 'Gold prices reached their highest point this month as investors seek safe-haven assets.',
          url: '#',
          source: 'Financial Times',
          publishedAt: new Date(Date.now() - 3600000).toISOString(),
          category: 'metals'
        },
        {
          id: '3',
          title: 'Wheat Production Forecasts Revised Upward',
          description: 'Agricultural experts predict better than expected wheat yields this season.',
          url: '#',
          source: 'AgriNews',
          publishedAt: new Date(Date.now() - 7200000).toISOString(),
          category: 'grains'
        }
      ];
      
      return new Response(
        JSON.stringify({ articles: fallbackNews, source: 'fallback' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search query with multiple searches for better coverage
    const economicQuery = 'inflation OR "interest rates" OR "federal reserve" OR "economic data" OR GDP OR recession';
    const geopoliticalQuery = 'geopolitical OR sanctions OR "trade war" OR OPEC OR "supply chain"';
    const commodityQuery = commodityKeywords.slice(0, 15).join(' OR '); // Use first 15 to avoid URL length limits
    
    const queries = [economicQuery, geopoliticalQuery, commodityQuery];
    const allArticles = [];
    
    for (const query of queries) {
      const searchParams = new URLSearchParams({
        q: query,
        sortBy: 'publishedAt',
        pageSize: '20', // Reduced per query to stay within limits
        language: 'en',
        apiKey: newsApiKey
      });

      try {
        const newsResponse = await fetch(`https://newsapi.org/v2/everything?${searchParams}`);
        
        if (newsResponse.ok) {
          const newsData = await newsResponse.json();
          allArticles.push(...(newsData.articles || []));
        }
      } catch (queryError) {
        console.error(`Error fetching news for query "${query}":`, queryError);
      }
    }
    
    // Remove duplicates based on URL
    const uniqueArticles = allArticles.filter((article, index, self) => 
      index === self.findIndex(a => a.url === article.url)
    );
    
    // Filter and format articles
    const articles: NewsItem[] = uniqueArticles
      .filter((article: any) => {
        // Filter out articles without essential data
        return article.title && 
               article.description && 
               article.url &&
               article.source?.name &&
               article.publishedAt;
      })
      .map((article: any) => {
        // Determine category based on content
        const content = (article.title + ' ' + article.description).toLowerCase();
        let category = 'general';
        
        if (content.includes('oil') || content.includes('crude') || content.includes('gas') || content.includes('energy')) {
          category = 'energy';
        } else if (content.includes('gold') || content.includes('silver') || content.includes('copper') || content.includes('metal')) {
          category = 'metals';
        } else if (content.includes('wheat') || content.includes('corn') || content.includes('grain') || content.includes('agriculture')) {
          category = 'grains';
        } else if (content.includes('cattle') || content.includes('livestock') || content.includes('beef')) {
          category = 'livestock';
        } else if (content.includes('coffee') || content.includes('sugar') || content.includes('cotton') || content.includes('cocoa')) {
          category = 'softs';
        } else if (content.includes('inflation') || content.includes('fed') || content.includes('interest rate') || content.includes('gdp')) {
          category = 'economic';
        } else if (content.includes('geopolitical') || content.includes('sanction') || content.includes('trade war') || content.includes('opec')) {
          category = 'geopolitical';
        }

        return {
          id: article.url, // Use URL as unique identifier
          title: article.title,
          description: article.description,
          url: article.url,
          source: article.source.name,
          publishedAt: article.publishedAt,
          urlToImage: article.urlToImage,
          category
        };
      })
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()) // Sort by newest first
      .slice(0, 40); // Increased limit to 40 articles for better coverage

    return new Response(
      JSON.stringify({ articles, source: 'api' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching news:', error);
    
      // Return enhanced fallback data on error
      const fallbackNews: NewsItem[] = [
        {
          id: '1',
          title: 'Federal Reserve Signals Potential Rate Changes Amid Inflation Concerns',
          description: 'Central bank officials hint at monetary policy adjustments as commodity markets react to inflation data.',
          url: '#',
          source: 'Economic Times',
          publishedAt: new Date().toISOString(),
          category: 'economic'
        },
        {
          id: '2',
          title: 'Global Supply Chain Disruptions Impact Commodity Prices',
          description: 'International shipping delays and geopolitical tensions continue to affect raw material costs worldwide.',
          url: '#',
          source: 'Trade News',
          publishedAt: new Date(Date.now() - 1800000).toISOString(),
          category: 'geopolitical'
        }
      ];
    
    return new Response(
      JSON.stringify({ articles: fallbackNews, source: 'fallback', error: 'Failed to fetch news' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});