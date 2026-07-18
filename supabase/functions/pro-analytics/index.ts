// Pro-tier Bloomberg-style analytics (Seasonality + Inter-Commodity Spreads).
// Snapshot-first: reads pre-computed payloads from pro_analytics_cache when fresh,
// otherwise recomputes from Massive Futures history (already used by other Pro tools).
// Verifies caller is Pro via public.get_user_tier(auth.uid()).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { fetchMassiveFrontMonthBars } from '../_shared/massive-client.ts';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const PRODUCTS: Record<string, { label: string; code: string }> = {
  wti:      { label: 'WTI Crude',    code: 'CL' },
  brent:    { label: 'Brent Crude',  code: 'BZ' },
  natgas:   { label: 'Natural Gas',  code: 'NG' },
  rbob:     { label: 'RBOB Gasoline',code: 'RB' },
  heating:  { label: 'Heating Oil',  code: 'HO' },
  gold:     { label: 'Gold',         code: 'GC' },
  silver:   { label: 'Silver',       code: 'SI' },
  copper:   { label: 'Copper',       code: 'HG' },
  platinum: { label: 'Platinum',     code: 'PL' },
  palladium:{ label: 'Palladium',    code: 'PA' },
  corn:     { label: 'Corn',         code: 'ZC' },
  wheat:    { label: 'Wheat',        code: 'ZW' },
  soybeans: { label: 'Soybeans',     code: 'ZS' },
  soymeal:  { label: 'Soybean Meal', code: 'ZM' },
  soyoil:   { label: 'Soybean Oil',  code: 'ZL' },
  cattle:   { label: 'Live Cattle',  code: 'LE' },
  hogs:     { label: 'Lean Hogs',    code: 'HE' },
};

// ------------- Seasonality -------------

interface MonthlyStat {
  month: number; // 1..12
  avgReturn: number; // %
  hitRate: number;   // fraction 0..1 (positive months / total)
  years: number;
  min: number;
  max: number;
}

function computeSeasonality(bars: { date: string; close: number }[]): MonthlyStat[] {
  // Group by year+month, compute month-end vs prior month-end return.
  const byYM = new Map<string, { first?: number; last?: number }>();
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  for (const b of sorted) {
    const ym = b.date.slice(0, 7); // YYYY-MM
    const entry = byYM.get(ym) ?? {};
    if (entry.first === undefined) entry.first = b.close;
    entry.last = b.close;
    byYM.set(ym, entry);
  }
  const keys = [...byYM.keys()].sort();
  const monthly: { month: number; ret: number }[] = [];
  for (let i = 1; i < keys.length; i++) {
    const prev = byYM.get(keys[i - 1])!;
    const cur = byYM.get(keys[i])!;
    if (prev.last == null || cur.last == null || prev.last === 0) continue;
    const ret = ((cur.last - prev.last) / prev.last) * 100;
    monthly.push({ month: Number(keys[i].slice(5, 7)), ret });
  }
  const out: MonthlyStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const rows = monthly.filter((r) => r.month === m).map((r) => r.ret);
    if (!rows.length) {
      out.push({ month: m, avgReturn: 0, hitRate: 0, years: 0, min: 0, max: 0 });
      continue;
    }
    const avg = rows.reduce((a, b) => a + b, 0) / rows.length;
    const wins = rows.filter((r) => r > 0).length;
    out.push({
      month: m,
      avgReturn: Number(avg.toFixed(2)),
      hitRate: Number((wins / rows.length).toFixed(3)),
      years: rows.length,
      min: Number(Math.min(...rows).toFixed(2)),
      max: Number(Math.max(...rows).toFixed(2)),
    });
  }
  return out;
}

async function buildSeasonality(commodity: string) {
  const product = PRODUCTS[commodity];
  if (!product) throw new Error(`Unknown commodity: ${commodity}`);
  const to = new Date();
  const from = new Date(to.getTime() - 20 * 365 * 24 * 60 * 60 * 1000);
  const bars = await fetchMassiveFrontMonthBars(
    product.code,
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10),
  );
  const rows = (bars as unknown as { date: string; close: number }[]).filter(
    (b) => b && b.close != null,
  );
  const months = computeSeasonality(rows);
  return {
    commodity,
    label: product.label,
    months,
    yearsCovered: months[0]?.years ?? 0,
    asOf: new Date().toISOString(),
  };
}

// ------------- Spreads -------------

type SpreadDef = {
  id: string;
  label: string;
  legs: { commodity: string; weight: number }[]; // spread = sum(weight * price)
  unit?: string;
  note?: string;
};

const SPREADS: SpreadDef[] = [
  {
    id: 'crack-321',
    label: '3-2-1 Crack Spread',
    legs: [
      { commodity: 'rbob', weight: 2 * 42 },     // RBOB $/gal -> $/bbl
      { commodity: 'heating', weight: 1 * 42 },  // HO   $/gal -> $/bbl
      { commodity: 'wti', weight: -3 },
    ],
    unit: '$/bbl (per crude bbl)',
    note: '(2×RBOB + 1×HO) × 42 − 3×WTI',
  },
  {
    id: 'soy-crush',
    label: 'Soybean Crush',
    legs: [
      { commodity: 'soymeal', weight: 2.2 * 0.022046 * 100 }, // meal $/ton -> ~ per bushel (approx: 48 lb meal + 11 lb oil per 60 lb bean)
      { commodity: 'soyoil',  weight: 11 * 0.01 },            // oil ¢/lb × 11 lb
      { commodity: 'soybeans', weight: -1 },
    ],
    unit: '$/bu (approx GPM)',
    note: 'Approx gross processing margin per bushel',
  },
  { id: 'wti-brent', label: 'WTI − Brent', legs: [{ commodity: 'wti', weight: 1 }, { commodity: 'brent', weight: -1 }], unit: '$/bbl' },
  { id: 'gold-silver', label: 'Gold / Silver Ratio', legs: [{ commodity: 'gold', weight: 1 }, { commodity: 'silver', weight: 0 }], unit: 'ratio', note: 'Special: gold ÷ silver' },
  { id: 'gold-platinum', label: 'Gold / Platinum Ratio', legs: [{ commodity: 'gold', weight: 1 }, { commodity: 'platinum', weight: 0 }], unit: 'ratio', note: 'Special: gold ÷ platinum' },
  { id: 'corn-wheat', label: 'Wheat − Corn', legs: [{ commodity: 'wheat', weight: 1 }, { commodity: 'corn', weight: -1 }], unit: '$/bu' },
  { id: 'soy-corn', label: 'Soybean / Corn Ratio', legs: [{ commodity: 'soybeans', weight: 1 }, { commodity: 'corn', weight: 0 }], unit: 'ratio', note: 'Special: soy ÷ corn' },
];

function mergeSeries(
  legs: { series: { date: string; close: number }[]; weight: number }[],
): { date: string; value: number }[] {
  if (!legs.length) return [];
  const dates = legs.map((l) => new Set(l.series.map((r) => r.date)));
  const commonDates = [...dates[0]].filter((d) => dates.every((s) => s.has(d))).sort();
  const lookups = legs.map((l) => new Map(l.series.map((r) => [r.date, r.close] as const)));
  const out: { date: string; value: number }[] = [];
  for (const d of commonDates) {
    let val = 0;
    for (let i = 0; i < legs.length; i++) val += legs[i].weight * (lookups[i].get(d) ?? 0);
    out.push({ date: d, value: val });
  }
  return out;
}

function ratioSeries(
  num: { date: string; close: number }[],
  den: { date: string; close: number }[],
): { date: string; value: number }[] {
  const dNum = new Map(num.map((r) => [r.date, r.close] as const));
  const dDen = new Map(den.map((r) => [r.date, r.close] as const));
  const out: { date: string; value: number }[] = [];
  for (const [date, n] of dNum) {
    const d = dDen.get(date);
    if (d && d !== 0) out.push({ date, value: n / d });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function mean(xs: number[]) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function stdev(xs: number[]) {
  const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

async function buildSpreads() {
  const to = new Date();
  const from = new Date(to.getTime() - 400 * 24 * 60 * 60 * 1000); // ~1y + buffer
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const commodities = new Set<string>();
  for (const s of SPREADS) for (const l of s.legs) commodities.add(l.commodity);

  const series: Record<string, { date: string; close: number }[]> = {};
  await Promise.all(
    [...commodities].map(async (c) => {
      const code = PRODUCTS[c]?.code;
      if (!code) return;
      try {
        const bars = await fetchMassiveFrontMonthBars(code, fromStr, toStr) as unknown as { date: string; close: number }[];
        series[c] = (bars ?? []).filter((b) => b && b.close != null);
      } catch {
        series[c] = [];
      }
    }),
  );

  const rows = SPREADS.map((spec) => {
    let ts: { date: string; value: number }[] = [];
    if (spec.note?.startsWith('Special: gold ÷ silver')) ts = ratioSeries(series.gold, series.silver);
    else if (spec.note?.startsWith('Special: gold ÷ platinum')) ts = ratioSeries(series.gold, series.platinum);
    else if (spec.note?.startsWith('Special: soy ÷ corn')) ts = ratioSeries(series.soybeans, series.corn);
    else {
      const legs = spec.legs
        .filter((l) => series[l.commodity]?.length)
        .map((l) => ({ series: series[l.commodity], weight: l.weight }));
      if (legs.length !== spec.legs.length) return { id: spec.id, label: spec.label, unit: spec.unit, note: spec.note, error: 'missing_data' };
      ts = mergeSeries(legs);
    }
    if (!ts.length) return { id: spec.id, label: spec.label, unit: spec.unit, note: spec.note, error: 'no_series' };

    const values = ts.map((r) => r.value);
    const current = values[values.length - 1];
    const last20 = values.slice(-20);
    const avg20 = mean(last20);
    const yearVals = values.slice(-252);
    const mu = mean(yearVals);
    const sd = stdev(yearVals);
    const z = sd > 0 ? (current - mu) / sd : 0;
    const spark = ts.slice(-60).map((r) => Number(r.value.toFixed(3)));
    const tag = z > 1.5 ? 'rich' : z < -1.5 ? 'cheap' : 'neutral';
    return {
      id: spec.id,
      label: spec.label,
      unit: spec.unit,
      note: spec.note?.startsWith('Special') ? undefined : spec.note,
      current: Number(current.toFixed(3)),
      avg20: Number(avg20.toFixed(3)),
      mean1y: Number(mu.toFixed(3)),
      std1y: Number(sd.toFixed(3)),
      zScore: Number(z.toFixed(2)),
      tag,
      spark,
      asOf: ts[ts.length - 1].date,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    rows,
  };
}

// ------------- Router -------------

const BodySchema = z.object({
  route: z.enum(['seasonality', 'spreads', 'regime', 'portfolio_analytics', 'backtest']),
  commodity: z.string().optional(),
  monthsLong: z.array(z.number().int().min(1).max(12)).optional(),
  years: z.number().int().min(1).max(20).optional(),
});

// ------------- Regime Scanner -------------

interface RegimeRow {
  commodity: string;
  label: string;
  price?: number;
  trend: 'up' | 'down' | 'sideways';
  vol: 'low' | 'normal' | 'high';
  volAnnualized?: number;
  return60d?: number;
  return20d?: number;
  error?: string;
}

function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx];
}

function computeRegime(bars: { date: string; close: number }[], label: string, commodity: string): RegimeRow {
  const rows = bars.filter((b) => b?.close != null).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 60) return { commodity, label, trend: 'sideways', vol: 'normal', error: 'insufficient_history' };
  const closes = rows.map((r) => r.close);
  const last = closes[closes.length - 1];
  const sma20 = mean(closes.slice(-20));
  const sma50 = mean(closes.slice(-50));
  const sma200 = closes.length >= 200 ? mean(closes.slice(-200)) : sma50;

  // Trend from SMA stack + slope
  let trend: RegimeRow['trend'] = 'sideways';
  const slope20 = (sma20 - mean(closes.slice(-40, -20))) / mean(closes.slice(-40, -20));
  if (last > sma20 && sma20 > sma50 && sma50 >= sma200 * 0.98 && slope20 > 0.005) trend = 'up';
  else if (last < sma20 && sma20 < sma50 && sma50 <= sma200 * 1.02 && slope20 < -0.005) trend = 'down';

  // Vol regime: 20d realized annualized, compared to trailing 1y rolling
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
  const last20 = rets.slice(-20);
  const vol20 = stdDev(last20) * Math.sqrt(252) * 100;
  const yearRets = rets.slice(-252);
  const rolling: number[] = [];
  for (let i = 20; i <= yearRets.length; i++) {
    rolling.push(stdDev(yearRets.slice(i - 20, i)) * Math.sqrt(252) * 100);
  }
  rolling.sort((a, b) => a - b);
  const p33 = percentile(rolling, 0.33);
  const p66 = percentile(rolling, 0.66);
  const vol: RegimeRow['vol'] = vol20 <= p33 ? 'low' : vol20 >= p66 ? 'high' : 'normal';

  const c60 = closes[closes.length - 61] ?? closes[0];
  const c20 = closes[closes.length - 21] ?? closes[0];
  return {
    commodity,
    label,
    price: Number(last.toFixed(3)),
    trend,
    vol,
    volAnnualized: Number(vol20.toFixed(1)),
    return60d: Number((((last - c60) / c60) * 100).toFixed(2)),
    return20d: Number((((last - c20) / c20) * 100).toFixed(2)),
  };
}

async function buildRegime() {
  const to = new Date();
  const from = new Date(to.getTime() - 400 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const rows = await Promise.all(
    Object.entries(PRODUCTS).map(async ([id, p]) => {
      try {
        const bars = (await fetchMassiveFrontMonthBars(p.code, fromStr, toStr)) as unknown as { date: string; close: number }[];
        return computeRegime(bars ?? [], p.label, id);
      } catch (err) {
        return { commodity: id, label: p.label, trend: 'sideways' as const, vol: 'normal' as const, error: String(err) };
      }
    }),
  );

  return { generatedAt: new Date().toISOString(), rows };
}

// ------------- Portfolio analytics -------------

interface PortfolioAnalytics {
  positions: number;
  currentValue: number;
  var95Daily: number;
  var95Pct: number;
  maxDrawdownPct: number;
  volAnnualizedPct: number;
  sharpe: number | null;
  beta: number | null;
  history: { date: string; value: number }[];
}

async function buildPortfolioAnalytics(admin: ReturnType<typeof createClient>, userId: string): Promise<PortfolioAnalytics | { error: string }> {
  const { data: positions } = await admin
    .from('portfolio_positions')
    .select('commodity_name, quantity, entry_price, position_type')
    .eq('user_id', userId);

  if (!positions?.length) {
    return { error: 'no_positions' };
  }

  // Map commodity_name -> product code via best-effort lookup on PRODUCTS labels.
  const nameToCode = new Map<string, { id: string; code: string; label: string }>();
  for (const [id, p] of Object.entries(PRODUCTS)) {
    nameToCode.set(p.label.toLowerCase(), { id, code: p.code, label: p.label });
  }

  const to = new Date();
  const from = new Date(to.getTime() - 260 * 24 * 60 * 60 * 1000);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const uniqueNames = Array.from(new Set(positions.map((p: any) => p.commodity_name)));
  const seriesByName: Record<string, { date: string; close: number }[]> = {};
  await Promise.all(
    uniqueNames.map(async (name: string) => {
      const match = nameToCode.get(name.toLowerCase());
      if (!match) return;
      try {
        const bars = (await fetchMassiveFrontMonthBars(match.code, fromStr, toStr)) as unknown as { date: string; close: number }[];
        seriesByName[name] = (bars ?? []).filter((b) => b?.close != null).sort((a, b) => a.date.localeCompare(b.date));
      } catch {
        seriesByName[name] = [];
      }
    }),
  );

  // Build daily portfolio value series across intersection of available dates
  const availableSeries = uniqueNames.map((n: string) => seriesByName[n]).filter((s) => s?.length);
  if (!availableSeries.length) return { error: 'no_price_history' };
  const commonDates = availableSeries[0].map((r) => r.date).filter((d) => availableSeries.every((s) => s.some((r) => r.date === d)));
  const lookups: Record<string, Map<string, number>> = {};
  for (const [name, series] of Object.entries(seriesByName)) {
    lookups[name] = new Map(series.map((r) => [r.date, r.close]));
  }

  const history: { date: string; value: number }[] = [];
  for (const d of commonDates) {
    let v = 0;
    for (const pos of positions as any[]) {
      const px = lookups[pos.commodity_name]?.get(d);
      if (px == null) continue;
      const dir = (pos.position_type === 'short' ? -1 : 1);
      v += dir * pos.quantity * px;
    }
    history.push({ date: d, value: v });
  }

  if (history.length < 20) return { error: 'insufficient_history' };

  const values = history.map((r) => r.value);
  const current = values[values.length - 1];
  const dailyRets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] === 0) continue;
    dailyRets.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  const sortedRets = [...dailyRets].sort((a, b) => a - b);
  const var95Pct = -percentile(sortedRets, 0.05) * 100;
  const var95Daily = (var95Pct / 100) * Math.abs(current);

  // Max drawdown
  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (v - peak) / peak;
      if (dd < maxDD) maxDD = dd;
    }
  }

  const volAnn = stdDev(dailyRets) * Math.sqrt(252) * 100;
  const meanRet = mean(dailyRets);
  const sharpe = stdDev(dailyRets) > 0 ? (meanRet / stdDev(dailyRets)) * Math.sqrt(252) : null;

  // Beta vs WTI (crude benchmark) if we have its series
  let beta: number | null = null;
  try {
    const wtiBars = (await fetchMassiveFrontMonthBars('CL', fromStr, toStr)) as unknown as { date: string; close: number }[];
    const wtiMap = new Map(wtiBars.map((r) => [r.date, r.close]));
    const pairedPort: number[] = [];
    const pairedWti: number[] = [];
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const cur = history[i];
      const wPrev = wtiMap.get(prev.date);
      const wCur = wtiMap.get(cur.date);
      if (prev.value === 0 || !wPrev || !wCur) continue;
      pairedPort.push((cur.value - prev.value) / prev.value);
      pairedWti.push((wCur - wPrev) / wPrev);
    }
    if (pairedPort.length >= 20) {
      const mPort = mean(pairedPort);
      const mWti = mean(pairedWti);
      let cov = 0, varW = 0;
      for (let i = 0; i < pairedPort.length; i++) {
        cov += (pairedPort[i] - mPort) * (pairedWti[i] - mWti);
        varW += (pairedWti[i] - mWti) ** 2;
      }
      beta = varW > 0 ? Number((cov / varW).toFixed(2)) : null;
    }
  } catch { /* ignore */ }

  return {
    positions: positions.length,
    currentValue: Number(current.toFixed(2)),
    var95Daily: Number(var95Daily.toFixed(2)),
    var95Pct: Number(var95Pct.toFixed(2)),
    maxDrawdownPct: Number((maxDD * 100).toFixed(2)),
    volAnnualizedPct: Number(volAnn.toFixed(2)),
    sharpe: sharpe != null ? Number(sharpe.toFixed(2)) : null,
    beta,
    history: history.slice(-90).map((h) => ({ date: h.date, value: Number(h.value.toFixed(2)) })),
  };
}

// ------------- Backtest (seasonality rule) -------------

async function buildBacktest(commodity: string, monthsLong: number[], years: number) {
  const product = PRODUCTS[commodity];
  if (!product) throw new Error(`Unknown commodity: ${commodity}`);
  const to = new Date();
  const from = new Date(to.getTime() - years * 365 * 24 * 60 * 60 * 1000);
  const bars = (await fetchMassiveFrontMonthBars(product.code, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10))) as unknown as { date: string; close: number }[];
  const sorted = bars.filter((b) => b?.close != null).sort((a, b) => a.date.localeCompare(b.date));

  // Compute monthly close series (month-end close)
  const byYM = new Map<string, number>();
  for (const b of sorted) byYM.set(b.date.slice(0, 7), b.close);
  const months = [...byYM.keys()].sort();

  const set = new Set(monthsLong);
  let equity = 1;
  const equityCurve: { date: string; equity: number }[] = [];
  const monthlyRets: number[] = [];
  const tradeMonths: number[] = [];
  let wins = 0;
  let trades = 0;

  for (let i = 1; i < months.length; i++) {
    const prev = byYM.get(months[i - 1])!;
    const cur = byYM.get(months[i])!;
    const m = Number(months[i].slice(5, 7));
    if (set.has(m) && prev > 0) {
      const ret = (cur - prev) / prev;
      equity *= 1 + ret;
      monthlyRets.push(ret);
      tradeMonths.push(m);
      trades++;
      if (ret > 0) wins++;
    }
    equityCurve.push({ date: months[i], equity: Number(equity.toFixed(4)) });
  }

  // Buy & hold benchmark
  const bhStart = byYM.get(months[0]);
  const bhEnd = byYM.get(months[months.length - 1]);
  const bhReturn = bhStart && bhEnd ? ((bhEnd - bhStart) / bhStart) * 100 : 0;

  // Metrics
  let peak = 1;
  let maxDD = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    const dd = (p.equity - peak) / peak;
    if (dd < maxDD) maxDD = dd;
  }
  const avgRet = monthlyRets.length ? mean(monthlyRets) : 0;
  const sd = monthlyRets.length > 1 ? stdDev(monthlyRets) : 0;
  const sharpe = sd > 0 ? (avgRet / sd) * Math.sqrt(12) : null;
  const yearsCovered = (months.length - 1) / 12;
  const cagr = yearsCovered > 0 ? (Math.pow(equity, 1 / yearsCovered) - 1) * 100 : 0;

  return {
    commodity,
    label: product.label,
    monthsLong,
    yearsCovered: Number(yearsCovered.toFixed(1)),
    totalReturnPct: Number(((equity - 1) * 100).toFixed(2)),
    cagrPct: Number(cagr.toFixed(2)),
    buyHoldReturnPct: Number(bhReturn.toFixed(2)),
    maxDrawdownPct: Number((maxDD * 100).toFixed(2)),
    sharpe: sharpe != null ? Number(sharpe.toFixed(2)) : null,
    hitRate: trades ? Number((wins / trades).toFixed(3)) : 0,
    trades,
    equityCurve,
    generatedAt: new Date().toISOString(),
  };
}

async function ensurePro(admin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await admin.rpc('get_user_tier', { _user_id: userId });
  if (error) return false;
  return data === 'pro';
}

serve(async (req) => {
  const logger = new EdgeLogger('pro-analytics');
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

    if (!(await ensurePro(admin, userData.user.id))) {
      return new Response(JSON.stringify({ error: 'Pro tier required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten() }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { route, commodity, monthsLong, years } = parsed.data;

    // Portfolio analytics is per-user — never cached in shared table.
    if (route === 'portfolio_analytics') {
      const payload = await buildPortfolioAnalytics(admin, userData.user.id);
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Backtest is parametric — cache keyed by inputs, short TTL not needed since it's cheap
    if (route === 'backtest') {
      const c = commodity && PRODUCTS[commodity] ? commodity : 'wti';
      const ml = (monthsLong && monthsLong.length ? monthsLong : [11, 12, 1]).slice().sort((a, b) => a - b);
      const yrs = years ?? 15;
      const payload = await buildBacktest(c, ml, yrs);
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cacheKey =
      route === 'seasonality' ? `seasonality:${commodity ?? 'wti'}` :
      route === 'regime' ? 'regime:all' :
      'spreads:all';

    // Snapshot lookup
    const { data: snap } = await admin
      .from('pro_analytics_cache')
      .select('payload, updated_at')
      .eq('key', cacheKey)
      .maybeSingle();

    const now = Date.now();
    const fresh = snap?.updated_at && now - new Date(snap.updated_at).getTime() < CACHE_TTL_MS;
    if (fresh && snap?.payload) {
      return new Response(JSON.stringify({ ...snap.payload, cached: true, asOf: snap.updated_at }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Compute
    let payload: Record<string, unknown>;
    if (route === 'seasonality') {
      const c = commodity && PRODUCTS[commodity] ? commodity : 'wti';
      payload = await buildSeasonality(c);
    } else if (route === 'regime') {
      payload = await buildRegime();
    } else {
      payload = await buildSpreads();
    }

    await admin
      .from('pro_analytics_cache')
      .upsert({ key: cacheKey, payload, updated_at: new Date().toISOString() });

    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('pro-analytics failed', err);
    // If we have a stale snapshot, return it
    return new Response(
      JSON.stringify({ error: 'Analytics unavailable', message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

export { PRODUCTS, SPREADS };