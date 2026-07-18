import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders } from '../_shared/utils.ts'

/**
 * Static metadata describing the canonical exchange/contract per commodity.
 * Prices are sourced from the cached `fetch-all-commodities` response —
 * no per-commodity API calls here (avoids burning the CPA Lite plan quota).
 */
const DIRECT_EXCHANGE_FEEDS: Record<
  string,
  { exchange: string; symbol: string; description: string }
> = {
  // Energy — NYMEX/ICE
  'WTI Crude Oil':   { exchange: 'NYMEX', symbol: 'CL=F', description: 'NYMEX WTI Crude Oil Futures' },
  'Brent Crude Oil': { exchange: 'ICE',   symbol: 'BZ=F', description: 'ICE Brent Crude Futures' },
  'Natural Gas':     { exchange: 'NYMEX', symbol: 'NG=F', description: 'NYMEX Natural Gas Futures' },
  'Heating Oil':     { exchange: 'NYMEX', symbol: 'HO=F', description: 'NYMEX Heating Oil Futures' },
  'Gasoline RBOB':   { exchange: 'NYMEX', symbol: 'RB=F', description: 'NYMEX RBOB Gasoline Futures' },

  // Metals — COMEX/NYMEX
  'Gold Futures':    { exchange: 'COMEX', symbol: 'GC=F', description: 'COMEX Gold Futures' },
  'Silver Futures':  { exchange: 'COMEX', symbol: 'SI=F', description: 'COMEX Silver Futures' },
  'Copper':          { exchange: 'COMEX', symbol: 'HG=F', description: 'COMEX Copper Futures' },
  'Platinum':        { exchange: 'NYMEX', symbol: 'PL=F', description: 'NYMEX Platinum Futures' },
  'Palladium':       { exchange: 'NYMEX', symbol: 'PA=F', description: 'NYMEX Palladium Futures' },

  // Grains — CBOT
  'Corn Futures':    { exchange: 'CBOT', symbol: 'ZC=F', description: 'CBOT Corn Futures' },
  'Wheat Futures':   { exchange: 'CBOT', symbol: 'ZW=F', description: 'CBOT Wheat Futures' },
  'Soybean Futures': { exchange: 'CBOT', symbol: 'ZS=F', description: 'CBOT Soybean Futures' },
  'Soybean Oil':     { exchange: 'CBOT', symbol: 'ZL=F', description: 'CBOT Soybean Oil Futures' },
  'Soybean Meal':    { exchange: 'CBOT', symbol: 'ZM=F', description: 'CBOT Soybean Meal Futures' },

  // Softs — ICE
  'Coffee Arabica':  { exchange: 'ICE', symbol: 'KC=F', description: 'ICE Coffee C Futures' },
  'Sugar #11':       { exchange: 'ICE', symbol: 'SB=F', description: 'ICE Sugar #11 Futures' },
  'Cotton':          { exchange: 'ICE', symbol: 'CT=F', description: 'ICE Cotton #2 Futures' },
  'Cocoa':           { exchange: 'ICE', symbol: 'CC=F', description: 'ICE Cocoa Futures' },
  'Orange Juice':    { exchange: 'ICE', symbol: 'OJ=F', description: 'ICE Orange Juice Futures' },
}

const exchangePriority: Record<string, number> = { NYMEX: 1, COMEX: 2, ICE: 3, CBOT: 4, CME: 5 }

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription_active, subscription_tier')
      .eq('id', user.id)
      .single()
    const isPremium = !!(profile?.subscription_active && profile?.subscription_tier !== 'free')

    // Reuse cached prices from fetch-all-commodities (CPA + OilPriceAPI).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const pricesByName = new Map<string, { price: number; change: number; changePercent: number }>()
    try {
      const upstream = await fetch(`${supabaseUrl}/functions/v1/fetch-all-commodities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.get('Authorization') ?? `Bearer ${anon}`,
        },
        body: JSON.stringify({ dataDelay: isPremium ? 'realtime' : '15min' }),
      })
      if (upstream.ok) {
        const upJson = await upstream.json()
        for (const c of upJson.commodities ?? []) {
          pricesByName.set(c.name, {
            price: Number(c.price) || 0,
            change: Number(c.change) || 0,
            changePercent: Number(c.changePercent) || 0,
          })
        }
      } else {
        console.warn(`fetch-all-commodities returned ${upstream.status}`)
      }
    } catch (err) {
      console.warn('Failed to fetch upstream commodities snapshot:', err)
    }

    const exchangeFeeds = Object.entries(DIRECT_EXCHANGE_FEEDS).map(([name, info]) => {
      const quote = pricesByName.get(name)
      return {
        commodity: name,
        exchange: info.exchange,
        symbol: info.symbol,
        description: info.description,
        dataSource: 'cached',
        price: quote?.price ?? null,
        change: quote?.change ?? null,
        changePercent: quote?.changePercent ?? null,
        lastUpdate: quote ? new Date().toISOString() : null,
        error: quote ? null : 'No quote available',
        isRealTime: isPremium,
      }
    })

    exchangeFeeds.sort((a, b) =>
      (exchangePriority[a.exchange] ?? 99) - (exchangePriority[b.exchange] ?? 99)
    )

    const summary = {
      totalExchanges: exchangeFeeds.length,
      successfulFeeds: exchangeFeeds.filter((f) => f.price !== null).length,
      failedFeeds: exchangeFeeds.filter((f) => f.price === null).length,
      exchanges: [...new Set(exchangeFeeds.map((f) => f.exchange))],
      isRealTime: isPremium,
      dataDelay: isPremium ? 'realtime' : '15min',
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        summary,
        exchangeFeeds,
        message: isPremium
          ? 'Exchange feed prices (cached from upstream commodity sources)'
          : 'Exchange feed prices with 15-minute delay',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error fetching direct exchange feeds:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
