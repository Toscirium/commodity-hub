// Nightly Pro Daily Brief generator.
// Reads pre-computed pro_analytics_cache (spreads + seasonality) and inserts
// one row per Pro user into pro_daily_briefs for today. Idempotent per day.
//
// Invoked by pg_cron at 06:00 UTC via net.http_post using service-role auth.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';

interface SpreadRow {
  id: string;
  label: string;
  unit?: string;
  current?: number;
  zScore?: number;
  tag?: string;
}

interface SeasonalityPayload {
  commodity: string;
  label: string;
  months: { month: number; avgReturn: number; hitRate: number; years: number }[];
}

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const SEASONAL_KEYS = ['wti','brent','natgas','rbob','heating','gold','silver','copper','corn','wheat','soybeans'];

serve(async (req) => {
  const logger = new EdgeLogger({ functionName: 'pro-daily-digest' });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = req.headers.get('authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('ALERT_EVALUATOR_SECRET');
  const xCron = req.headers.get('x-cron-secret');
  if (!((serviceKey && auth === `Bearer ${serviceKey}`) || (cronSecret && xCron === cronSecret))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // 1) Spread extremes (|z| >= 1.5)
    const { data: spreadSnap } = await supabase
      .from('pro_analytics_cache')
      .select('payload, updated_at')
      .eq('key', 'spreads:all')
      .maybeSingle();

    const spreadRows = ((spreadSnap?.payload as { rows?: SpreadRow[] })?.rows ?? [])
      .filter((r) => typeof r.zScore === 'number' && Math.abs(r.zScore ?? 0) >= 1.5)
      .sort((a, b) => Math.abs(b.zScore ?? 0) - Math.abs(a.zScore ?? 0))
      .slice(0, 5)
      .map((r) => ({
        label: r.label,
        current: r.current,
        unit: r.unit,
        zScore: r.zScore,
        tag: r.tag,
      }));

    // 2) Seasonal biases for current month across major commodities
    const currentMonth = new Date().getUTCMonth() + 1;
    const seasonalBiases: { commodity: string; label: string; avgReturn: number; hitRate: number; years: number }[] = [];
    for (const key of SEASONAL_KEYS) {
      const { data: snap } = await supabase
        .from('pro_analytics_cache')
        .select('payload')
        .eq('key', `seasonality:${key}`)
        .maybeSingle();
      const payload = snap?.payload as SeasonalityPayload | undefined;
      const monthStat = payload?.months?.find((m) => m.month === currentMonth);
      if (payload && monthStat && monthStat.years >= 5 && (Math.abs(monthStat.avgReturn) >= 2 || monthStat.hitRate >= 0.7 || monthStat.hitRate <= 0.3)) {
        seasonalBiases.push({
          commodity: payload.commodity,
          label: payload.label,
          avgReturn: monthStat.avgReturn,
          hitRate: monthStat.hitRate,
          years: monthStat.years,
        });
      }
    }
    seasonalBiases.sort((a, b) => Math.abs(b.avgReturn) - Math.abs(a.avgReturn));
    const topSeasonal = seasonalBiases.slice(0, 5);

    // 3) Build headline
    const parts: string[] = [];
    if (spreadRows.length) {
      const top = spreadRows[0];
      parts.push(`${top.label} is ${top.tag} (z ${top.zScore?.toFixed(2)})`);
    }
    if (topSeasonal.length) {
      const top = topSeasonal[0];
      parts.push(`${top.label} historically ${top.avgReturn > 0 ? 'strong' : 'weak'} in ${MONTH_LABELS[currentMonth - 1]}`);
    }
    const headline = parts.length
      ? parts.join(' · ')
      : `Pro Daily Brief — ${MONTH_LABELS[currentMonth - 1]} ${new Date().getUTCDate()}`;

    const sections = [
      {
        id: 'spread_extremes',
        title: 'Stretched spreads',
        items: spreadRows,
      },
      {
        id: 'seasonal_biases',
        title: `Seasonal biases · ${MONTH_LABELS[currentMonth - 1]}`,
        items: topSeasonal,
      },
    ];

    const briefDate = new Date().toISOString().slice(0, 10);

    // 4) Enumerate Pro users
    const { data: proUsers, error: usersErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('subscription_active', true)
      .eq('subscription_tier', 'pro');

    if (usersErr) throw usersErr;
    if (!proUsers?.length) {
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5) Upsert one brief per user (idempotent via unique (user_id, brief_date))
    const rows = proUsers.map((u: { id: string }) => ({
      user_id: u.id,
      brief_date: briefDate,
      headline,
      sections,
    }));

    const { error: insErr } = await supabase
      .from('pro_daily_briefs')
      .upsert(rows, { onConflict: 'user_id,brief_date' });
    if (insErr) throw insErr;

    logger.info(`Inserted ${rows.length} briefs for ${briefDate}`);
    return new Response(JSON.stringify({ ok: true, inserted: rows.length, briefDate }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('pro-daily-digest failed', err);
    return new Response(JSON.stringify({ error: 'digest_failed', message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});