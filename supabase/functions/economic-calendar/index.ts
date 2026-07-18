import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/utils.ts'
import { IpRateLimiter } from '../_shared/rateLimit.ts'

// FRED has generous limits but each call fans out to 30+ requests — strict cap per IP.
const limiter = new IpRateLimiter({ limit: 10, windowMs: 60_000 });

// Curated US economic indicators tracked via FRED.
// We resolve each series's release_id at runtime (avoids stale hardcoded IDs).
const TRACKED_SERIES: Array<{
  series_id: string;
  title: string;
  impact: 'low' | 'medium' | 'high';
  category: string;
  commodityImpact: string[];
  releaseTimeET: string;
}> = [
  { series_id: 'PAYEMS',   title: 'Nonfarm Payrolls',                 impact: 'high',   category: 'employment',   commodityImpact: ['Gold Futures', 'WTI Crude Oil', 'Silver Futures'], releaseTimeET: '08:30' },
  { series_id: 'UNRATE',   title: 'Unemployment Rate',                impact: 'high',   category: 'employment',   commodityImpact: ['Gold Futures', 'Silver Futures'],                  releaseTimeET: '08:30' },
  { series_id: 'ICSA',     title: 'Initial Jobless Claims',           impact: 'medium', category: 'employment',   commodityImpact: ['Gold Futures'],                                    releaseTimeET: '08:30' },
  { series_id: 'CPIAUCSL', title: 'Consumer Price Index (CPI)',       impact: 'high',   category: 'inflation',    commodityImpact: ['Gold Futures', 'Silver Futures', 'Copper'],        releaseTimeET: '08:30' },
  { series_id: 'CPILFESL', title: 'Core CPI',                         impact: 'high',   category: 'inflation',    commodityImpact: ['Gold Futures', 'Silver Futures'],                  releaseTimeET: '08:30' },
  { series_id: 'PPIACO',   title: 'Producer Price Index (PPI)',       impact: 'medium', category: 'inflation',    commodityImpact: ['Gold Futures', 'Copper'],                          releaseTimeET: '08:30' },
  { series_id: 'PCEPI',    title: 'PCE Price Index',                  impact: 'high',   category: 'inflation',    commodityImpact: ['Gold Futures', 'Silver Futures'],                  releaseTimeET: '08:30' },
  { series_id: 'GDPC1',    title: 'Real GDP',                         impact: 'high',   category: 'gdp',          commodityImpact: ['WTI Crude Oil', 'Copper', 'Gold Futures'],         releaseTimeET: '08:30' },
  { series_id: 'INDPRO',   title: 'Industrial Production',            impact: 'medium', category: 'manufacturing',commodityImpact: ['Copper', 'WTI Crude Oil', 'Aluminum'],             releaseTimeET: '09:15' },
  { series_id: 'RSAFS',    title: 'Retail Sales',                     impact: 'medium', category: 'consumer',     commodityImpact: ['Gold Futures', 'WTI Crude Oil'],                   releaseTimeET: '08:30' },
  { series_id: 'HOUST',    title: 'Housing Starts',                   impact: 'medium', category: 'housing',      commodityImpact: ['Lumber', 'Copper'],                                releaseTimeET: '08:30' },
  { series_id: 'UMCSENT',  title: 'Consumer Sentiment (U. Michigan)', impact: 'medium', category: 'consumer',     commodityImpact: ['Gold Futures'],                                    releaseTimeET: '10:00' },
  { series_id: 'BOPGSTB',  title: 'Trade Balance',                    impact: 'medium', category: 'trade',        commodityImpact: ['WTI Crude Oil', 'Copper', 'Gold Futures'],         releaseTimeET: '08:30' },
  { series_id: 'WCESTUS1', title: 'EIA Crude Oil Inventories',        impact: 'high',   category: 'energy',       commodityImpact: ['WTI Crude Oil', 'Brent Crude Oil'],                releaseTimeET: '10:30' },
  { series_id: 'WGTSTUS1', title: 'EIA Natural Gas Storage',          impact: 'medium', category: 'energy',       commodityImpact: ['Natural Gas'],                                     releaseTimeET: '10:30' },
];

interface FredObservation { date: string; value: string; }
interface FredReleaseDate { release_id: number; release_name: string; date: string; }

async function fredFetch(path: string, params: Record<string, string>, apiKey: string): Promise<any> {
  const qs = new URLSearchParams({ ...params, api_key: apiKey, file_type: 'json' });
  const res = await fetch(`https://api.stlouisfed.org/fred/${path}?${qs}`);
  if (!res.ok) {
    console.error(`FRED ${path} error: ${res.status} ${await res.text()}`);
    throw new Error(`FRED API error: ${res.status}`);
  }
  return res.json();
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
    const apiKey = Deno.env.get('FRED_API_KEY');
    if (!apiKey) throw new Error('FRED_API_KEY not configured');

    let body: { from?: string; to?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const now = new Date();
    const fromDate = body.from || now.toISOString().split('T')[0];
    const toDate = body.to || new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    console.log(`[FRED] Calendar window ${fromDate} → ${toDate}`);

    // For each tracked series, fetch in parallel:
    //   1. its release metadata (resolves release_id + name)
    //   2. its last 2 observations (previous + actual)
    // Then fetch release dates per unique release_id.
    const seriesData = await Promise.all(
      TRACKED_SERIES.map(async (s) => {
        try {
          const [releaseInfo, obsData] = await Promise.all([
            fredFetch('series/release', { series_id: s.series_id }, apiKey),
            fredFetch('series/observations', {
              series_id: s.series_id,
              sort_order: 'desc',
              limit: '2',
            }, apiKey),
          ]);
          const release = releaseInfo.releases?.[0];
          const observations: FredObservation[] = obsData.observations || [];
          return { ...s, release_id: release?.id as number | undefined, release_name: release?.name as string | undefined, observations };
        } catch (err) {
          console.warn(`[FRED] Failed metadata for ${s.series_id}:`, err);
          return { ...s, release_id: undefined, release_name: undefined, observations: [] as FredObservation[] };
        }
      })
    );

    // Get unique release_ids and fetch their scheduled dates in window
    const uniqueReleaseIds = Array.from(new Set(seriesData.map(s => s.release_id).filter(Boolean) as number[]));

    const releaseDatesMap = new Map<number, FredReleaseDate[]>();
    await Promise.all(
      uniqueReleaseIds.map(async (rid) => {
        try {
          const data = await fredFetch('release/dates', {
            release_id: String(rid),
            realtime_start: fromDate,
            realtime_end: toDate,
            include_release_dates_with_no_data: 'true',
            sort_order: 'asc',
            limit: '100',
          }, apiKey);
          releaseDatesMap.set(rid, data.release_dates || []);
        } catch (err) {
          console.warn(`[FRED] Failed dates for release ${rid}:`, err);
          releaseDatesMap.set(rid, []);
        }
      })
    );

    // Build events: one per (series × scheduled date in window)
    const events: any[] = [];
    for (const s of seriesData) {
      if (!s.release_id) continue;
      const dates = releaseDatesMap.get(s.release_id) || [];
      const latestObs = s.observations[0];
      const priorObs = s.observations[1];

      for (const rd of dates) {
        // Filter dates strictly inside our window (FRED sometimes returns extras)
        if (rd.date < fromDate || rd.date > toDate) continue;

        const isFuture = rd.date >= today;
        const previous = priorObs?.value && priorObs.value !== '.' ? priorObs.value : undefined;
        const actual = !isFuture && latestObs?.value && latestObs.value !== '.' ? latestObs.value : undefined;

        events.push({
          id: `fred-${s.release_id}-${s.series_id}-${rd.date}`,
          title: s.title,
          description: `${s.title} — United States${s.release_name ? ` (${s.release_name})` : ''}`,
          date: rd.date,
          time: s.releaseTimeET,
          impact: s.impact,
          country: 'US',
          category: s.category,
          previous,
          forecast: undefined, // FRED does not provide consensus
          actual,
          change: undefined,
          changePercentage: undefined,
          commodityImpact: s.commodityImpact,
        });
      }
    }

    events.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.time.localeCompare(b.time);
    });

    console.log(`[FRED] Returning ${events.length} events`);

    return new Response(
      JSON.stringify({
        events,
        count: events.length,
        from: fromDate,
        to: toDate,
        source: 'FRED (Federal Reserve Economic Data)',
        note: 'Forecast/consensus not provided by FRED. Showing scheduled releases with previous and (when available) actual values.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Economic calendar error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message, events: [] }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
