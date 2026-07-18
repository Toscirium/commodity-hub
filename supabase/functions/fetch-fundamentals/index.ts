// Physical Market Intelligence — EIA Weekly Petroleum/NatGas, USDA NASS, Open-Meteo weather, Baker Hughes rigs.
// Public data, cached in fundamentals_snapshots. Snapshot-first with 6h TTL.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const EIA_BASE = 'https://api.eia.gov/v2';
const OPEN_METEO_ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const NASS_BASE = 'https://quickstats.nass.usda.gov/api/api_GET';
const RIGS_URL = 'https://rigcount.bakerhughes.com/rig-count-overview';

interface SeriesSpec {
  seriesId: string;
  dataset: string;
  label: string;
  unit: string;
  weeks: number;
}

// EIA v2 series IDs (stable, documented at api.eia.gov/v2/seriesid/{ID})
const EIA_SERIES: SeriesSpec[] = [
  // Weekly Petroleum Status Report (Wednesdays 10:30 ET)
  { seriesId: 'PET.WCESTUS1.W', dataset: 'petroleum', label: 'Crude Oil Stocks (excl. SPR)', unit: 'Thousand Barrels', weeks: 260 },
  { seriesId: 'PET.WGTSTUS1.W', dataset: 'petroleum', label: 'Motor Gasoline Stocks', unit: 'Thousand Barrels', weeks: 260 },
  { seriesId: 'PET.WDISTUS1.W', dataset: 'petroleum', label: 'Distillate Fuel Stocks', unit: 'Thousand Barrels', weeks: 260 },
  { seriesId: 'PET.WCRRIUS2.W', dataset: 'petroleum', label: 'Refinery Crude Runs', unit: 'Thousand Barrels/Day', weeks: 260 },
  { seriesId: 'PET.WPULEUS3.W', dataset: 'petroleum', label: 'Refinery Utilization', unit: 'Percent', weeks: 260 },
  { seriesId: 'PET.WCRIMUS2.W', dataset: 'petroleum', label: 'Crude Oil Imports', unit: 'Thousand Barrels/Day', weeks: 260 },
  // Weekly Natural Gas Storage Report (Thursdays 10:30 ET)
  { seriesId: 'NG.NW2_EPG0_SWO_R48_BCF.W', dataset: 'natgas_storage', label: 'Working Gas in Storage (Lower 48)', unit: 'Bcf', weeks: 260 },
];

interface Observation { period: string; value: number }

async function fetchEIASeries(spec: SeriesSpec, apiKey: string): Promise<Observation[]> {
  const url = `${EIA_BASE}/seriesid/${spec.seriesId}?api_key=${apiKey}&sort[0][column]=period&sort[0][direction]=desc&length=${spec.weeks}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EIA ${spec.seriesId} HTTP ${res.status}`);
  const json = await res.json();
  const rows = json?.response?.data ?? [];
  return rows
    .map((r: Record<string, unknown>): Observation | null => {
      const period = typeof r.period === 'string' ? r.period : null;
      const raw = r.value;
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
      if (!period || !Number.isFinite(value)) return null;
      return { period, value };
    })
    .filter((x: Observation | null): x is Observation => x !== null)
    .reverse();
}

function computeStats(obs: Observation[]) {
  if (obs.length === 0) {
    return { latest_value: null, latest_period: null, wow_change: null, yoy_change: null, five_year_avg: null };
  }
  const latest = obs[obs.length - 1];
  const prev = obs.length >= 2 ? obs[obs.length - 2] : null;
  const yearAgo = obs.length >= 53 ? obs[obs.length - 53] : null;
  const sameWeekValues: number[] = [];
  for (let n = 1; n <= 5; n++) {
    const idx = obs.length - 1 - n * 52;
    if (idx >= 0) sameWeekValues.push(obs[idx].value);
  }
  const fiveYearAvg = sameWeekValues.length
    ? sameWeekValues.reduce((a, b) => a + b, 0) / sameWeekValues.length
    : null;
  return {
    latest_value: latest.value,
    latest_period: latest.period,
    wow_change: prev ? latest.value - prev.value : null,
    yoy_change: yearAgo ? latest.value - yearAgo.value : null,
    five_year_avg: fiveYearAvg,
  };
}

// ---------- Open-Meteo weather ----------
interface WeatherLocation { label: string; lat: number; lon: number; kind: 'heating' | 'cooling' | 'growing' | 'precip' }

const WEATHER_LOCATIONS: WeatherLocation[] = [
  { label: 'New York City (Heating Demand)', lat: 40.7128, lon: -74.006, kind: 'heating' },
  { label: 'Chicago (Heating Demand)', lat: 41.8781, lon: -87.6298, kind: 'heating' },
  { label: 'Houston (Cooling Demand)', lat: 29.7604, lon: -95.3698, kind: 'cooling' },
  { label: 'Phoenix (Cooling Demand)', lat: 33.4484, lon: -112.074, kind: 'cooling' },
  { label: 'Des Moines, IA (GDD)', lat: 41.5868, lon: -93.625, kind: 'growing' },
  { label: 'Corn Belt Precipitation (Iowa)', lat: 41.5868, lon: -93.625, kind: 'precip' },
  { label: 'Wheat Belt Precipitation (Kansas)', lat: 38.5266, lon: -96.7265, kind: 'precip' },
];

function fToC(f: number): number { return (f - 32) * 5 / 9; }

function getWeeklyEnd(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const delta = day === 6 ? 0 : 6 - day;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function aggregateWeather(
  daily: { date: string; tmax: number; tmin: number; precip: number }[],
  kind: 'heating' | 'cooling' | 'growing' | 'precip',
): Observation[] {
  const map = new Map<string, { sum: number; count: number }>();
  for (const day of daily) {
    let value = 0;
    if (kind === 'precip') {
      value = Number.isFinite(day.precip) ? Math.max(0, day.precip) : 0;
    } else {
      const tavg = (day.tmax + day.tmin) / 2;
      if (!Number.isFinite(tavg)) continue;
      if (kind === 'heating') value = Math.max(0, 65 - tavg);
      else if (kind === 'cooling') value = Math.max(0, tavg - 65);
      else value = Math.max(0, tavg - 50);
    }
    const week = getWeeklyEnd(day.date);
    const cur = map.get(week) ?? { sum: 0, count: 0 };
    cur.sum += value;
    cur.count += 1;
    map.set(week, cur);
  }
  return Array.from(map.entries())
    .map(([period, { sum, count }]) => ({
      period,
      // precip is a weekly total; degree days are a daily average
      value: kind === 'precip' ? sum : count ? sum / count : 0,
    }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

async function fetchWeatherLocation(loc: WeatherLocation): Promise<{ spec: SeriesSpec; observations: Observation[]; stats: ReturnType<typeof computeStats> }> {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dailyVars = loc.kind === 'precip' ? 'precipitation_sum' : 'temperature_2m_max,temperature_2m_min';
  const url = `${OPEN_METEO_ARCHIVE}?latitude=${loc.lat}&longitude=${loc.lon}&start_date=${start}&end_date=${end}&daily=${dailyVars}&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${loc.label} HTTP ${res.status}`);
  const json = await res.json();
  const dates: string[] = json?.daily?.time ?? [];
  const maxs: number[] = json?.daily?.temperature_2m_max ?? [];
  const mins: number[] = json?.daily?.temperature_2m_min ?? [];
  const precips: number[] = json?.daily?.precipitation_sum ?? [];
  const daily = dates
    .map((date, i) => ({ date, tmax: maxs[i] ?? NaN, tmin: mins[i] ?? NaN, precip: precips[i] ?? NaN }))
    .filter((d) => (loc.kind === 'precip' ? Number.isFinite(d.precip) : Number.isFinite(d.tmax) && Number.isFinite(d.tmin)));
  const observations = aggregateWeather(daily, loc.kind);
  const unit = loc.kind === 'growing'
    ? 'GDD (base 50°F)'
    : loc.kind === 'heating'
      ? 'HDD (base 65°F)'
      : loc.kind === 'cooling'
        ? 'CDD (base 65°F)'
        : 'Weekly Precip (inches)';
  const spec: SeriesSpec = { seriesId: `weather-${loc.kind}-${loc.label}`, dataset: 'weather', label: loc.label, unit, weeks: 260 };
  return { spec, observations, stats: computeStats(observations) };
}

// ---------- USDA NASS Quick Stats ----------
interface NASSSpec { queryId: string; dataset: string; label: string; unit: string; params: Record<string, string>; periodField: 'week_ending' | 'reference_period_desc'; }

const NASS_SPECS: NASSSpec[] = [
  { queryId: 'usda-corn-planted', dataset: 'usda', label: 'Corn Planted Progress', unit: 'Percent', params: { commodity_desc: 'CORN', statisticcat_desc: 'PROGRESS', unit_desc: 'PCT AREA PLANTED', freq_desc: 'WEEKLY', agg_level_desc: 'NATIONAL' }, periodField: 'week_ending' },
  { queryId: 'usda-soybean-planted', dataset: 'usda', label: 'Soybean Planted Progress', unit: 'Percent', params: { commodity_desc: 'SOYBEANS', statisticcat_desc: 'PROGRESS', unit_desc: 'PCT AREA PLANTED', freq_desc: 'WEEKLY', agg_level_desc: 'NATIONAL' }, periodField: 'week_ending' },
  { queryId: 'usda-corn-condition', dataset: 'usda', label: 'Corn Good/Excellent Condition', unit: 'Percent', params: { commodity_desc: 'CORN', statisticcat_desc: 'CONDITION', unit_desc: 'PCT GOOD EXCELLENT', freq_desc: 'WEEKLY', agg_level_desc: 'NATIONAL' }, periodField: 'week_ending' },
  { queryId: 'usda-soybean-condition', dataset: 'usda', label: 'Soybean Good/Excellent Condition', unit: 'Percent', params: { commodity_desc: 'SOYBEANS', statisticcat_desc: 'CONDITION', unit_desc: 'PCT GOOD EXCELLENT', freq_desc: 'WEEKLY', agg_level_desc: 'NATIONAL' }, periodField: 'week_ending' },
  { queryId: 'usda-winter-wheat-condition', dataset: 'usda', label: 'Winter Wheat Good/Excellent Condition', unit: 'Percent', params: { commodity_desc: 'WHEAT', statisticcat_desc: 'CONDITION', unit_desc: 'PCT GOOD EXCELLENT', freq_desc: 'WEEKLY', agg_level_desc: 'NATIONAL', class_desc: 'WINTER' }, periodField: 'week_ending' },
  { queryId: 'usda-cattle-on-feed', dataset: 'usda', label: 'Cattle on Feed', unit: 'Thousand Head', params: { commodity_desc: 'CATTLE', statisticcat_desc: 'ON FEED', unit_desc: 'HEAD', freq_desc: 'MONTHLY', agg_level_desc: 'NATIONAL' }, periodField: 'reference_period_desc' },
  { queryId: 'usda-cold-storage-beef', dataset: 'usda', label: 'Cold Storage — Beef Total', unit: 'Thousand Pounds', params: { commodity_desc: 'BEEF', statisticcat_desc: 'STOCKS', unit_desc: 'LB', freq_desc: 'MONTHLY', agg_level_desc: 'NATIONAL' }, periodField: 'reference_period_desc' },
  { queryId: 'usda-cold-storage-pork', dataset: 'usda', label: 'Cold Storage — Pork Total', unit: 'Thousand Pounds', params: { commodity_desc: 'PORK', statisticcat_desc: 'STOCKS', unit_desc: 'LB', freq_desc: 'MONTHLY', agg_level_desc: 'NATIONAL' }, periodField: 'reference_period_desc' },
];

async function fetchNASSSeries(spec: NASSSpec, apiKey: string): Promise<{ spec: SeriesSpec; observations: Observation[]; stats: ReturnType<typeof computeStats> }> {
  const params = new URLSearchParams({ key: apiKey, format: 'JSON', year__GE: '2023', ...spec.params });
  const url = `${NASS_BASE}?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASS ${spec.queryId} HTTP ${res.status}`);
  const json = await res.json().catch(() => ({}));
  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
  const obs: Observation[] = rows
    .map((r: Record<string, unknown>): Observation | null => {
      const period = typeof r[spec.periodField] === 'string' ? (r[spec.periodField] as string) : null;
      const value = typeof r.Value === 'number' ? r.Value : typeof r.Value === 'string' ? Number(r.Value.replace(/,/g, '')) : NaN;
      if (!period || !Number.isFinite(value)) return null;
      return { period, value };
    })
    .filter((x: Observation | null): x is Observation => x !== null)
    .sort((a: Observation, b: Observation) => a.period.localeCompare(b.period));

  const seriesSpec: SeriesSpec = { seriesId: spec.queryId, dataset: spec.dataset, label: spec.label, unit: spec.unit, weeks: 260 };
  return { spec: seriesSpec, observations: obs, stats: computeStats(obs) };
}

// ---------- Baker Hughes rig count (scrape) ----------
interface RigRow { label: string; value: number; change: number; date: string }

async function fetchRigsOverview(): Promise<RigRow[]> {
  const res = await fetch(RIGS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; commodity-data/1.0)' },
  });
  if (!res.ok) throw new Error(`Baker Hughes HTTP ${res.status}`);
  const html = await res.text();

  // Extract the date from the page header (e.g., "10 July 2026")
  const dateMatch = html.match(/(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})/);
  const date = dateMatch ? new Date(`${dateMatch[2]} ${dateMatch[1]}, ${dateMatch[3]}`).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  // The overview table rows contain: Area, Last Count, Count, Change from Prior, Date of Prior, Change from Last Year, Date of Last Year
  // We want the U.S. row and the Canada row. We'll regex the first two rows after the table headers.
  const rows: RigRow[] = [];
  const tableMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tableMatch) return rows;
  const tbody = tableMatch[1];
  const trs = Array.from(tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi));
  for (const tr of trs) {
    const cells = Array.from(tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((m) => m[1].replace(/<[^>]+>/g, '').trim());
    if (cells.length < 4) continue;
    const area = cells[0];
    const count = Number(cells[2].replace(/,/g, ''));
    const change = Number(cells[3].replace(/,/g, '').replace(/[+,]/g, ''));
    if (area.toLowerCase().startsWith('u.s.') || area.toLowerCase().startsWith('us ')) {
      rows.push({ label: 'U.S. Total Rotary Rigs', value: count, change: Number.isFinite(change) ? change : 0, date });
    } else if (area.toLowerCase().startsWith('canada')) {
      rows.push({ label: 'Canada Total Rotary Rigs', value: count, change: Number.isFinite(change) ? change : 0, date });
    }
  }
  return rows;
}

function rigRowToSeries(row: RigRow): SeriesSpec {
  return { seriesId: `rigs-${row.label}`, dataset: 'rigs', label: row.label, unit: 'Rigs', weeks: 52 };
}

// ---------- Orchestration ----------

async function refreshEIA(apiKey: string, logger: EdgeLogger) {
  const results = await Promise.allSettled(
    EIA_SERIES.map(async (spec) => {
      const observations = await fetchEIASeries(spec, apiKey);
      return { spec, observations, stats: computeStats(observations) };
    }),
  );
  const rows: Array<Record<string, unknown>> = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error('EIA fetch failed', r.reason);
      continue;
    }
    const { spec, observations, stats } = r.value;
    rows.push({
      series_id: spec.seriesId,
      dataset: spec.dataset,
      label: spec.label,
      unit: spec.unit,
      observations,
      ...stats,
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

async function refreshWeather(logger: EdgeLogger) {
  const results = await Promise.allSettled(WEATHER_LOCATIONS.map((loc) => fetchWeatherLocation(loc)));
  const rows: Array<Record<string, unknown>> = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error('Weather fetch failed', r.reason);
      continue;
    }
    const { spec, observations, stats } = r.value;
    rows.push({
      series_id: spec.seriesId,
      dataset: spec.dataset,
      label: spec.label,
      unit: spec.unit,
      observations,
      ...stats,
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

async function refreshUSDA(apiKey: string, logger: EdgeLogger) {
  const results = await Promise.allSettled(NASS_SPECS.map((spec) => fetchNASSSeries(spec, apiKey)));
  const rows: Array<Record<string, unknown>> = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      logger.error('USDA fetch failed', r.reason);
      continue;
    }
    const { spec, observations, stats } = r.value;
    rows.push({
      series_id: spec.seriesId,
      dataset: spec.dataset,
      label: spec.label,
      unit: spec.unit,
      observations,
      ...stats,
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

async function refreshRigs(logger: EdgeLogger) {
  const rows: Array<Record<string, unknown>> = [];
  try {
    const latest = await fetchRigsOverview();
    for (const row of latest) {
      const spec = rigRowToSeries(row);
      rows.push({
        series_id: spec.seriesId,
        dataset: spec.dataset,
        label: spec.label,
        unit: spec.unit,
        observations: [{ period: row.date, value: row.value }],
        latest_value: row.value,
        latest_period: row.date,
        wow_change: row.change,
        yoy_change: null,
        five_year_avg: null,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error('Rigs fetch failed', err);
  }
  return rows;
}

const BodySchema = z.object({
  dataset: z.enum(['petroleum', 'natgas_storage', 'weather', 'usda', 'rigs', 'all']).optional().default('all'),
  force: z.boolean().optional().default(false),
});

serve(async (req) => {
  const logger = new EdgeLogger({ functionName: 'fetch-fundamentals' });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const eiaKey = Deno.env.get('EIA_API_KEY');
    const usdaKey = Deno.env.get('USDA_NASS_API_KEY');

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { dataset, force } = parsed.data;

    const query = admin.from('fundamentals_snapshots').select('*').order('label');
    if (dataset !== 'all') query.eq('dataset', dataset);
    const { data: cached, error: fetchErr } = await query;
    if (fetchErr) throw fetchErr;

    const now = Date.now();
    const stale = !cached?.length || cached.some(
      (r) => now - new Date(r.updated_at as string).getTime() > CACHE_TTL_MS,
    );

    if (stale || force) {
      const allRows: Array<Record<string, unknown>> = [];
      if (dataset === 'all' || dataset === 'petroleum' || dataset === 'natgas_storage') {
        if (!eiaKey) {
          return new Response(JSON.stringify({ error: 'EIA_API_KEY not configured' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        allRows.push(...await refreshEIA(eiaKey, logger));
      }
      if (dataset === 'all' || dataset === 'weather') {
        allRows.push(...await refreshWeather(logger));
      }
      if (dataset === 'all' || dataset === 'usda') {
        if (!usdaKey) {
          return new Response(JSON.stringify({ error: 'USDA_NASS_API_KEY not configured' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        allRows.push(...await refreshUSDA(usdaKey, logger));
      }
      if (dataset === 'all' || dataset === 'rigs') {
        allRows.push(...await refreshRigs(logger));
      }

      if (allRows.length) {
        const { error } = await admin.from('fundamentals_snapshots').upsert(allRows, { onConflict: 'series_id' });
        if (error) logger.error('fundamentals upsert failed', error);
      }
      logger.info(`refreshed ${allRows.length} series`);

      const { data: fresh } = await admin.from('fundamentals_snapshots').select('*').order('label');
      const filtered = dataset === 'all' ? fresh : fresh?.filter((r) => r.dataset === dataset);
      return new Response(JSON.stringify({ rows: filtered ?? [], cached: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ rows: cached ?? [], cached: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('fetch-fundamentals failed', err);
    return new Response(
      JSON.stringify({ error: 'Fundamentals unavailable', message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
