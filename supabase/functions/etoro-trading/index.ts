// Day-to-day eToro Trading API calls for an already-connected user — see
// etoro-auth for how the OAuth connection itself is established.
//
// DEMO ACCOUNTS ONLY. Every path below hits /api/v2/trading/execution/demo
// or /api/v1/trading/info/demo, never the real-money equivalents — see the
// migration's file-level comment for why. Do not add a "real" branch here
// without that legal/compliance sign-off existing first; it is not an
// engineering decision.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { getLiveAccessToken, etoroFetch, resolveInstrumentId } from '../_shared/etoroClient.ts';

// Kept in sync by hand with massive-client.ts's PRODUCTS map (same commodity
// ids used across the app) rather than imported across function boundaries —
// see that file's own comment on why each edge function stays self-contained.
// The search query is deliberately just the plain commodity name; eToro's
// own relevance ranking picks the right CFD instrument from it.
const COMMODITY_SEARCH: Record<string, string> = {
  wti: 'WTI Crude Oil',
  brent: 'Brent Oil',
  natgas: 'Natural Gas',
  gold: 'Gold',
  silver: 'Silver',
  copper: 'Copper',
  platinum: 'Platinum',
  palladium: 'Palladium',
  corn: 'Corn',
  wheat: 'Wheat',
  soybeans: 'Soybean',
};

const ORDER_AMOUNT_MAX_USD = 5000; // demo balances are simulated, but a sane ceiling avoids a fat-fingered order
const LEVERAGE_MAX = 5;

Deno.serve(async (req) => {
  const logger = new EdgeLogger({ functionName: 'etoro-trading' });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Authentication required' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return json({ error: 'Invalid session' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'status') {
      const { data: row } = await admin
        .from('etoro_connections')
        .select('etoro_sub, scopes, created_at')
        .eq('user_id', userId)
        .maybeSingle();
      return json({ connected: Boolean(row), scopes: row?.scopes ?? null, connectedAt: row?.created_at ?? null });
    }

    const accessToken = await getLiveAccessToken(admin, userId);
    if (!accessToken) return json({ error: 'not_connected', message: 'Connect an eToro demo account first' }, 409);

    if (action === 'portfolio') {
      const res = await etoroFetch(accessToken, '/api/v1/trading/info/demo/aggregate-portfolio');
      if (!res.ok) return json({ error: 'Could not load eToro portfolio', detail: res.data }, 502);
      return json(res.data);
    }

    if (action === 'history') {
      // minDate is required by this endpoint and lookback windows must stay
      // under a year — default to the last 90 days, which is plenty for a
      // "recent activity" view and comfortably inside that limit.
      const minDate = typeof body?.minDate === 'string'
        ? body.minDate
        : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await etoroFetch(
        accessToken,
        `/api/v1/trading/info/trade/demo/history?${new URLSearchParams({ minDate })}`,
      );
      if (!res.ok) return json({ error: 'Could not load eToro trading history', detail: res.data }, 502);
      return json(res.data);
    }

    if (action === 'place_order') {
      const { commodity, transaction, amount, leverage } = body ?? {};
      if (!COMMODITY_SEARCH[commodity]) return json({ error: 'Unknown or unsupported commodity' }, 400);
      if (transaction !== 'buy' && transaction !== 'sellShort') {
        return json({ error: "transaction must be 'buy' or 'sellShort'" }, 400);
      }
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0 || amountNum > ORDER_AMOUNT_MAX_USD) {
        return json({ error: `amount must be between 0 and ${ORDER_AMOUNT_MAX_USD} USD` }, 400);
      }
      const leverageNum = leverage == null ? 1 : Number(leverage);
      if (!Number.isInteger(leverageNum) || leverageNum < 1 || leverageNum > LEVERAGE_MAX) {
        return json({ error: `leverage must be an integer between 1 and ${LEVERAGE_MAX}` }, 400);
      }

      const resolved = await resolveInstrumentId(admin, accessToken, commodity, COMMODITY_SEARCH[commodity]);
      if (!resolved) return json({ error: 'Could not resolve this commodity to an eToro instrument' }, 502);

      const orderRes = await etoroFetch(accessToken, '/api/v2/trading/execution/demo/orders', {
        method: 'POST',
        body: {
          action: 'open',
          transaction,
          instrumentId: resolved.instrumentId,
          orderType: 'mkt',
          leverage: leverageNum,
          amount: amountNum,
          orderCurrency: 'usd',
          // Required by eToro whenever leverage > 1 or shorting — see
          // create-an-order's constraints. 10% away from... we don't have a
          // live rate here, so this asks eToro to reject rather than guess:
          // omit stopLossRate for a plain 1x long, which is the only case
          // it isn't required.
          ...(leverageNum > 1 || transaction === 'sellShort' ? { stopLossType: 'fixed' } : {}),
        },
      });
      if (!orderRes.ok) return json({ error: 'eToro rejected the order', detail: orderRes.data }, 502);
      return json({ ...orderRes.data, instrument: resolved.displayName });
    }

    if (action === 'cancel_order') {
      const { orderId } = body ?? {};
      if (!orderId) return json({ error: 'orderId required' }, 400);
      const res = await etoroFetch(accessToken, `/api/v2/trading/execution/demo/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) return json({ error: 'Could not cancel order', detail: res.data }, 502);
      return json({ cancelled: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    logger.error('etoro-trading failed', err);
    return json({ error: 'eToro trading request failed', message: (err as Error).message }, 500);
  }
});
