// Fetch CME futures-options settlements (EOD, ~1 business-day lag).
// Public JSON endpoint pattern used by cmegroup.com/tools-information/.
//
// - GET expirations list per product
// - GET one expiration's chain (strikes with call/put settlements + OI + vol)
//
// We cache aggressively in-memory (per-instance) because settlements only
// change once a day and CME rate-limits their public JSON.
//
// Input body: { product: 'CL'|'NG'|'GC'|'ZC'|'ZS', expiration?: string }
// If `expiration` is omitted, we return the front-month chain.

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

// CME "webId" (productId) for options products on the underlying futures.
// Sourced from cmegroup.com quote widgets. If CME rotates these, the
// scraper still returns a friendly error instead of crashing.
const PRODUCT_IDS: Record<string, { id: number; name: string; label: string }> = {
  CL: { id: 190, name: 'LO', label: 'WTI Crude Oil Options' },
  NG: { id: 1352, name: 'LNE', label: 'Natural Gas European Options' },
  GC: { id: 192, name: 'OG', label: 'Gold Options' },
  ZC: { id: 300, name: 'OZC', label: 'Corn Options' },
  ZS: { id: 320, name: 'OZS', label: 'Soybean Options' },
};

const BASE = 'https://www.cmegroup.com/CmeWS/mvc';

const BodySchema = z.object({
  product: z.enum(['CL', 'NG', 'GC', 'ZC', 'ZS']),
  expiration: z.string().max(16).optional(),
});

type Expiration = { code: string; label: string; expirationDate?: string };
type ChainRow = {
  strike: number;
  callSettle: number | null;
  callVolume: number | null;
  callOpenInterest: number | null;
  putSettle: number | null;
  putVolume: number | null;
  putOpenInterest: number | null;
};
type ChainPayload = {
  product: string;
  productLabel: string;
  expirations: Expiration[];
  expiration: string;
  expirationDate: string | null;
  underlying: number | null;
  tradeDate: string | null;
  rows: ChainRow[];
};

const cache = new Map<string, { at: number; data: unknown }>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6h — settlements are daily

async function cmeFetch(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; commodity-hub/1.0)',
      },
    }).finally(() => clearTimeout(t));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchExpirations(productId: number): Promise<Expiration[]> {
  // Two endpoints CME has used; try both.
  const urls = [
    `${BASE}/Quotes/Option/${productId}/G/OptionsExpirations`,
    `${BASE}/Settlements/Options/ExpirationsList/${productId}`,
  ];
  for (const url of urls) {
    const j = await cmeFetch(url);
    if (!j) continue;
    const arr: any[] = Array.isArray(j) ? j : Array.isArray(j?.expirations) ? j.expirations : Array.isArray(j?.optionExpirations) ? j.optionExpirations : [];
    if (arr.length === 0) continue;
    const parsed = arr
      .map((x: any): Expiration | null => {
        const code = String(x?.code ?? x?.expiration ?? x?.expirationCode ?? '');
        if (!code) return null;
        const label = String(x?.label ?? x?.twoDigitsCode ?? x?.expirationMonth ?? code);
        const expirationDate = x?.expirationDate ? String(x.expirationDate) : undefined;
        return { code, label, expirationDate };
      })
      .filter((x): x is Expiration => !!x);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

async function fetchChain(productId: number, expCode: string): Promise<{
  rows: ChainRow[]; underlying: number | null; tradeDate: string | null; expirationDate: string | null;
}> {
  const url = `${BASE}/Quotes/Option/${productId}/G/${encodeURIComponent(expCode)}/ALL?optionExpiration=${productId}-${encodeURIComponent(expCode)}&pageSize=500`;
  const j = await cmeFetch(url, 10000);
  const quotes: any[] = Array.isArray(j?.optionContractQuotes) ? j.optionContractQuotes : [];
  const num = (v: any): number | null => {
    if (v == null) return null;
    const s = String(v).replace(/[,]/g, '').trim();
    if (!s || s === '-' || s.toUpperCase() === 'N/A') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  const rows: ChainRow[] = quotes
    .map((q: any) => {
      const strike = num(q?.strikePrice ?? q?.strike);
      if (strike == null) return null;
      return {
        strike,
        callSettle: num(q?.call?.priorSettle ?? q?.call?.settlement ?? q?.callPriorSettle ?? q?.callSettlement),
        callVolume: num(q?.call?.volume ?? q?.callVolume),
        callOpenInterest: num(q?.call?.openInterest ?? q?.callOpenInterest),
        putSettle: num(q?.put?.priorSettle ?? q?.put?.settlement ?? q?.putPriorSettle ?? q?.putSettlement),
        putVolume: num(q?.put?.volume ?? q?.putVolume),
        putOpenInterest: num(q?.put?.openInterest ?? q?.putOpenInterest),
      } as ChainRow;
    })
    .filter((r): r is ChainRow => !!r)
    .sort((a, b) => a.strike - b.strike);
  const underlying = num(j?.underlyingFutureQuote?.priorSettle ?? j?.underlyingFutureQuote?.last ?? j?.underlyingPriorSettle);
  const tradeDate = j?.tradeDate ? String(j.tradeDate) : null;
  const expirationDate = j?.expirationDate ? String(j.expirationDate) : null;
  return { rows, underlying, tradeDate, expirationDate };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { product } = parsed.data;
    const meta = PRODUCT_IDS[product];
    if (!meta) {
      return new Response(JSON.stringify({ error: 'Unsupported product' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const cacheKey = `${product}:${parsed.data.expiration ?? 'front'}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return new Response(JSON.stringify({ ...(hit.data as object), cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const expirations = await fetchExpirations(meta.id);
    if (expirations.length === 0) {
      return new Response(JSON.stringify({
        error: 'CME expirations feed unavailable',
        hint: 'CME rotates their public JSON schema periodically; product ID may need updating.',
        product, productLabel: meta.label,
      }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const expCode = parsed.data.expiration && expirations.some((e) => e.code === parsed.data.expiration)
      ? parsed.data.expiration
      : expirations[0].code;
    const { rows, underlying, tradeDate, expirationDate } = await fetchChain(meta.id, expCode);

    const payload: ChainPayload = {
      product,
      productLabel: meta.label,
      expirations,
      expiration: expCode,
      expirationDate: expirationDate ?? expirations.find((e) => e.code === expCode)?.expirationDate ?? null,
      underlying,
      tradeDate,
      rows,
    };
    cache.set(cacheKey, { at: Date.now(), data: payload });
    return new Response(JSON.stringify({ ...payload, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal error', message: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});