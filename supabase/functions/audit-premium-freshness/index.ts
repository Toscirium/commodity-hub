// Audits the freshness of every premium catalog symbol against its upstream API
// (CommodityPriceAPI for non-energy, OilPriceAPI for energy) and snapshots the
// result into the `system_metrics` table. Admin-only.
//
// Status buckets (mirrors mem://project/commodity-catalog-scope decision rule):
//   live      : last tick < 4h
//   eod       : 4h–24h
//   stale     : 24h–7d
//   dead      : >7d, missing, or upstream error
//
// Designed to be invoked daily by pg_cron + service_role, or on-demand by an
// admin user from the /admin/catalog-audit page.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/utils.ts';
import {
  COMMODITY_PRICE_API_SYMBOLS,
  CENT_QUOTED_SYMBOLS,
  PREMIUM_COMMODITIES,
  COMMODITY_SYMBOLS,
  getCommodityCategory,
} from '../_shared/commodity-mappings.ts';

type FreshnessStatus = 'live' | 'eod' | 'stale' | 'dead';

interface AuditRow {
  name: string;
  source: 'cpa' | 'oilpriceapi';
  category: string;
  symbol: string;
  price: number | null;
  lastTickAge_h: number | null;
  status: FreshnessStatus;
  error?: string;
}

const OIL_API_BASE = 'https://api.oilpriceapi.com/v1';
const CPA_API_BASE = 'https://api.commoditypriceapi.com/v2';

function classify(ageHours: number | null): FreshnessStatus {
  if (ageHours == null) return 'dead';
  if (ageHours < 4) return 'live';
  if (ageHours < 24) return 'eod';
  if (ageHours < 24 * 7) return 'stale';
  return 'dead';
}

function ageHours(tsMs: number): number {
  return (Date.now() - tsMs) / (1000 * 60 * 60);
}

/** Hit CPA /rates/latest in batches of 5 (Lite plan cap). */
async function auditCpa(apiKey: string, names: string[]): Promise<AuditRow[]> {
  const out: AuditRow[] = [];
  const targets = names
    .filter((n) => COMMODITY_PRICE_API_SYMBOLS[n])
    .map((n) => ({ name: n, symbol: COMMODITY_PRICE_API_SYMBOLS[n] }));

  for (let i = 0; i < targets.length; i += 5) {
    const batch = targets.slice(i, i + 5);
    const symbolsParam = batch.map((b) => b.symbol).join(',');
    const url = `${CPA_API_BASE}/rates/latest?symbols=${encodeURIComponent(symbolsParam)}`;
    try {
      const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
      if (!res.ok) {
        for (const t of batch) {
          out.push({
            name: t.name,
            source: 'cpa',
            symbol: t.symbol,
            category: getCommodityCategory(t.name),
            price: null,
            lastTickAge_h: null,
            status: 'dead',
            error: `HTTP ${res.status}`,
          });
        }
        continue;
      }
      const json = await res.json();
      const tsMs = json?.timestamp ? json.timestamp * 1000 : null;
      const age = tsMs ? ageHours(tsMs) : null;
      for (const t of batch) {
        let raw = json?.rates?.[t.symbol];
        if (typeof raw !== 'number') {
          out.push({
            name: t.name,
            source: 'cpa',
            symbol: t.symbol,
            category: getCommodityCategory(t.name),
            price: null,
            lastTickAge_h: null,
            status: 'dead',
            error: 'no rate',
          });
          continue;
        }
        if (CENT_QUOTED_SYMBOLS.has(t.symbol)) raw = raw / 100;
        out.push({
          name: t.name,
          source: 'cpa',
          symbol: t.symbol,
          category: getCommodityCategory(t.name),
          price: raw,
          lastTickAge_h: age,
          status: classify(age),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'fetch failed';
      for (const t of batch) {
        out.push({
          name: t.name,
          source: 'cpa',
          symbol: t.symbol,
          category: getCommodityCategory(t.name),
          price: null,
          lastTickAge_h: null,
          status: 'dead',
          error: msg,
        });
      }
    }
    // Throttle (CPA Lite = 10 req/min)
    if (i + 5 < targets.length) await new Promise((r) => setTimeout(r, 6500));
  }
  return out;
}

/** Hit OilPriceAPI in one batch via /prices/past_day_price endpoint. */
const OIL_BLEND_CODES: Record<string, string> = {
  'Crude Oil Dubai': 'DUBAI_CRUDE_USD',
  'DME Oman Crude': 'DME_OMAN_USD',
  'Murban Crude': 'MURBAN_CRUDE_USD',
  'OPEC Basket': 'OPEC_BASKET_USD',
  'Western Canadian Select': 'WCS_CRUDE_USD',
  'WTI Midland': 'WTI_MIDLAND_USD',
  'Mars Blend': 'MARS_USD',
  'Louisiana Light Sweet': 'LOUISIANA_LIGHT_USD',
  'Natural Gas UK': 'NATURAL_GAS_GBP',
  'Dutch TTF Gas': 'DUTCH_TTF_EUR',
  'Japan/Korea LNG': 'JKM_LNG_USD',
  'Gasoline RBOB': 'GASOLINE_RBOB_USD',
  'Heating Oil': 'HEATING_OIL_USD',
  'Jet Fuel': 'JET_FUEL_USD',
  'ULSD Diesel': 'ULSD_DIESEL_USD',
  'Gasoil': 'GASOIL_USD',
  'Naphtha': 'NAPHTHA_USD',
};

async function auditOil(apiKey: string, names: string[]): Promise<AuditRow[]> {
  const out: AuditRow[] = [];
  for (const name of names) {
    const code = OIL_BLEND_CODES[name];
    if (!code) {
      out.push({
        name,
        source: 'oilpriceapi',
        symbol: '?',
        category: 'energy',
        price: null,
        lastTickAge_h: null,
        status: 'dead',
        error: 'no code mapping',
      });
      continue;
    }
    try {
      const url = `${OIL_API_BASE}/prices/latest?type=spot_price&code=${encodeURIComponent(code)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Token ${apiKey}` },
      });
      if (!res.ok) {
        out.push({
          name,
          source: 'oilpriceapi',
          symbol: code,
          category: 'energy',
          price: null,
          lastTickAge_h: null,
          status: 'dead',
          error: `HTTP ${res.status}`,
        });
        continue;
      }
      const json = await res.json();
      const data = json?.data ?? json;
      const price = typeof data?.price === 'number' ? data.price : null;
      const created = data?.created_at ? Date.parse(data.created_at) : NaN;
      const age = Number.isFinite(created) ? ageHours(created) : null;
      out.push({
        name,
        source: 'oilpriceapi',
        symbol: code,
        category: 'energy',
        price,
        lastTickAge_h: age,
        status: price == null ? 'dead' : classify(age),
      });
    } catch (err) {
      out.push({
        name,
        source: 'oilpriceapi',
        symbol: code,
        category: 'energy',
        price: null,
        lastTickAge_h: null,
        status: 'dead',
        error: err instanceof Error ? err.message : 'fetch failed',
      });
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Admin gate: accept either service_role (cron) OR a user JWT with admin role.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  let isAuthorized = false;
  if (token && token === serviceRoleKey) {
    isAuthorized = true;
  } else if (token) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) {
      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      const { data: roleRows } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (roleRows) isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const cpaKey = Deno.env.get('COMMODITYPRICE_API_KEY');
  const oilKey = Deno.env.get('OIL_PRICE_API_KEY');
  if (!cpaKey || !oilKey) {
    return new Response(JSON.stringify({ error: 'API keys not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const allPremium = Array.from(PREMIUM_COMMODITIES);
  const energyNames = allPremium.filter(
    (n) => COMMODITY_SYMBOLS[n]?.category === 'energy',
  );
  const cpaNames = allPremium.filter(
    (n) => COMMODITY_SYMBOLS[n]?.category !== 'energy',
  );

  const [oilRows, cpaRows] = await Promise.all([
    auditOil(oilKey, energyNames),
    auditCpa(cpaKey, cpaNames),
  ]);

  const rows: AuditRow[] = [...oilRows, ...cpaRows].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const counts = rows.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<FreshnessStatus, number>,
  );

  // Snapshot to system_metrics so we get a 7-day rolling history.
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  await adminClient.from('system_metrics').insert({
    metric_name: 'premium_freshness',
    metric_value: rows.length,
    metadata: { rows, counts, audited_at: new Date().toISOString() },
  });

  return new Response(
    JSON.stringify({ counts, rows, audited_at: new Date().toISOString() }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});