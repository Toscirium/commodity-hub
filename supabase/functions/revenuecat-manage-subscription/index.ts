// Returns a pre-authenticated RevenueCat Web Billing customer-portal URL
// for the calling (already-signed-in) user, skipping the "check your email"
// magic-link step that the client SDK's own CustomerInfo.managementURL
// requires — see the client-side fallback in src/services/revenueCatWeb.ts
// (getWebManagementUrl), which is used if this function is unavailable or
// errors, so an outage here degrades to "one extra step," not "broken."
//
// Needs RC's secret API key (REVENUECAT_SECRET_API_KEY) — a materially
// different credential from the public VITE_REVENUECAT_WEB_KEY the client
// SDK uses, and one that must never reach the browser, hence this function.
//
// Two RC REST API v2 calls:
//   1. List the customer's subscriptions, find their active Web Billing one
//      (app_user_id === our Supabase user id, same as everywhere else in
//      this app's RevenueCat integration).
//   2. Ask for an *authorized* management URL for that specific
//      subscription — the one that skips email verification, since we've
//      already verified the caller via their Supabase session.
// https://www.revenuecat.com/docs/api-v2

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';
import { safeLog } from '../_shared/safeConsole.ts';

// RevenueCat project id — not a secret, same status as any other public
// project identifier (visible in the RC dashboard URL itself).
const RC_PROJECT_ID = 'proj69ac632e';
const RC_API_BASE = 'https://api.revenuecat.com/v2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

interface RCSubscription {
  id: string;
  store: string;
  status: string;
  gives_access: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const secretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secretKey) return json({ error: 'not_configured' }, 500);
  const rcHeaders = { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };

  try {
    const listRes = await fetch(
      `${RC_API_BASE}/projects/${RC_PROJECT_ID}/customers/${user.id}/subscriptions`,
      { headers: rcHeaders },
    );
    if (!listRes.ok) {
      safeLog.error('RC list subscriptions failed', { status: listRes.status, body: await listRes.text() });
      return json({ error: 'rc_lookup_failed' }, 502);
    }
    const list = await listRes.json();
    const items: RCSubscription[] = list?.items ?? [];
    // Only Web Billing subscriptions need this — native store subscriptions
    // (play_store, app_store) already have their own deep links client-side
    // and were never routed through this function.
    const sub = items.find((s) => s.gives_access && (s.store === 'rc_billing' || s.store === 'stripe'));
    if (!sub) return json({ management_url: null });

    const urlRes = await fetch(
      `${RC_API_BASE}/projects/${RC_PROJECT_ID}/subscriptions/${sub.id}/management_url`,
      { headers: rcHeaders },
    );
    if (!urlRes.ok) {
      safeLog.error('RC management_url failed', { status: urlRes.status, body: await urlRes.text() });
      return json({ error: 'rc_management_url_failed' }, 502);
    }
    const { management_url } = await urlRes.json();
    return json({ management_url: management_url ?? null });
  } catch (err) {
    safeLog.error('revenuecat-manage-subscription failed', err);
    return json({ error: 'internal_error' }, 500);
  }
});
