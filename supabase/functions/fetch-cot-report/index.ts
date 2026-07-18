// Pulls the CFTC Disaggregated Futures-Only weekly report and caches a subset
// of commodities into public.cot_reports. Designed to run on a cron schedule
// every Friday evening when CFTC publishes. Idempotent via UNIQUE(commodity, report_date).
//
// Public CFTC dataset: https://publicreporting.cftc.gov/resource/72hh-3qpy.json

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';

// Map CFTC contract names → our display names
const COMMODITY_MAP: Record<string, string> = {
  'WTI FINANCIAL CRUDE OIL - NEW YORK MERCANTILE EXCHANGE': 'WTI Crude Oil',
  'BRENT LAST DAY - NEW YORK MERCANTILE EXCHANGE': 'Brent Crude Oil',
  'NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE': 'Natural Gas',
  'GASOLINE RBOB - NEW YORK MERCANTILE EXCHANGE': 'RBOB Gasoline',
  'NY HARBOR ULSD - NEW YORK MERCANTILE EXCHANGE': 'ULSD Diesel',
  'ETHANOL - NEW YORK MERCANTILE EXCHANGE': 'Ethanol',
  'PROPANE - NEW YORK MERCANTILE EXCHANGE': 'Propane',
  'GOLD - COMMODITY EXCHANGE INC.': 'Gold',
  'SILVER - COMMODITY EXCHANGE INC.': 'Silver',
  'COPPER- #1 - COMMODITY EXCHANGE INC.': 'Copper',
  'CORN - CHICAGO BOARD OF TRADE': 'Corn',
  'WHEAT-SRW - CHICAGO BOARD OF TRADE': 'Wheat',
  'SOYBEANS - CHICAGO BOARD OF TRADE': 'Soybeans',
  'COFFEE C - ICE FUTURES U.S.': 'Coffee',
  'SUGAR NO. 11 - ICE FUTURES U.S.': 'Sugar',
  'COTTON NO. 2 - ICE FUTURES U.S.': 'Cotton',
};

interface CftcRow {
  market_and_exchange_names: string;
  report_date_as_yyyy_mm_dd: string;
  m_money_positions_long_all: string;
  m_money_positions_short_all: string;
  prod_merc_positions_long: string;
  prod_merc_positions_short: string;
  open_interest_all: string;
}

const parsePosition = (value?: string) => Number.parseInt(value || '0', 10) || 0;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const logger = new EdgeLogger({ functionName: 'fetch-cot-report' });

  // Public CFTC data — function is idempotent (UNIQUE on commodity+report_date)
  // and only writes the rows we control. Safe to invoke without auth.

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pull last 60 weeks of data, filtered to our commodity list.
    // CFTC's Disaggregated dataset calls commercial positions "Producer/Merchant".
    const names = Object.keys(COMMODITY_MAP)
      .map((name) => `'${name.replace(/'/g, "''")}'`)
      .join(',');
    const params = new URLSearchParams({
      '$select': 'market_and_exchange_names,report_date_as_yyyy_mm_dd,m_money_positions_long_all,m_money_positions_short_all,prod_merc_positions_long,prod_merc_positions_short,open_interest_all',
      '$where': `market_and_exchange_names in (${names})`,
      '$order': 'report_date_as_yyyy_mm_dd DESC',
      '$limit': '5000',
    });
    const url = `https://publicreporting.cftc.gov/resource/72hh-3qpy.json?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const detail = await resp.text();
      throw new Error(`CFTC ${resp.status}: ${detail.slice(0, 300)}`);
    }
    const rows: CftcRow[] = await resp.json();

    let inserted = 0;
    for (const row of rows) {
      const commodity = COMMODITY_MAP[row.market_and_exchange_names];
      if (!commodity) continue;
      const mmLong = parsePosition(row.m_money_positions_long_all);
      const mmShort = parsePosition(row.m_money_positions_short_all);
      const commLong = parsePosition(row.prod_merc_positions_long);
      const commShort = parsePosition(row.prod_merc_positions_short);
      const oi = parsePosition(row.open_interest_all);
      const { error } = await supabase.from('cot_reports').upsert({
        commodity,
        report_date: row.report_date_as_yyyy_mm_dd.slice(0, 10),
        managed_money_long: mmLong,
        managed_money_short: mmShort,
        commercials_long: commLong,
        commercials_short: commShort,
        net_position: mmLong - mmShort,
        open_interest: oi,
      }, { onConflict: 'commodity,report_date', ignoreDuplicates: false });
      if (!error) inserted++;
      else logger.warn('Upsert failed', { commodity, err: error.message });
    }
    logger.info(`COT sync done: ${inserted}/${rows.length} rows`);
    return new Response(JSON.stringify({ ok: true, processed: rows.length, inserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error('fetch-cot-report failed', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});