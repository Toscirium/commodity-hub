// RevenueCat webhook → updates profiles.subscription_active / subscription_tier / subscription_end.
// Configure in RevenueCat dashboard: Project Settings → Integrations → Webhooks.
// URL: https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
// Authorization header: Bearer <REVENUECAT_WEBHOOK_AUTH>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts'

const PREMIUM_ENTITLEMENT = 'premium';
const PRO_ENTITLEMENT = 'pro';

interface RCEvent {
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  environment?: string;
}

interface RCPayload {
  event: RCEvent;
  api_version?: string;
}

const ACTIVATING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'TRANSFER',
]);
// Hard deactivations: subscription is fully gone.
const DEACTIVATING = new Set(['CANCELLATION', 'EXPIRATION']);
// Soft states: user retains/loses access but billing needs attention.
const BILLING_ISSUE = 'BILLING_ISSUE';
const SUBSCRIPTION_PAUSED = 'SUBSCRIPTION_PAUSED';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  const auth = req.headers.get('authorization') ?? '';
  if (!expected || auth !== `Bearer ${expected}`) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders });
  }

  let payload: RCPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: corsHeaders });
  }

  const event = payload?.event;
  if (!event?.type || !event.app_user_id) {
    return new Response('Invalid event', { status: 400, headers: corsHeaders });
  }

  const entitlements = event.entitlement_ids ?? [];
  const isPaidEvent =
    entitlements.includes(PREMIUM_ENTITLEMENT) ||
    entitlements.includes(PRO_ENTITLEMENT) ||
    entitlements.length === 0;
  if (!isPaidEvent) {
    return new Response(JSON.stringify({ ignored: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Resolve tier from the highest-priority active entitlement.
  // `pro` wins over `premium` so users on the Pro product get full features.
  const resolvedTier = entitlements.includes(PRO_ENTITLEMENT)
    ? 'pro'
    : entitlements.includes(PREMIUM_ENTITLEMENT)
      ? 'premium'
      : 'premium'; // fallback for legacy events with no entitlement_ids

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const userId = event.app_user_id;
  const subscriptionEnd = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : null;

  let update: Record<string, unknown> | null = null;
  if (ACTIVATING.has(event.type)) {
    update = {
      subscription_active: true,
      subscription_tier: resolvedTier,
      subscription_end: subscriptionEnd,
      billing_state: 'active',
      grace_period_expires_at: null,
      updated_at: new Date().toISOString(),
    };
  } else if (DEACTIVATING.has(event.type)) {
    update = {
      subscription_active: false,
      subscription_tier: 'free',
      subscription_end: subscriptionEnd,
      billing_state: 'canceled',
      grace_period_expires_at: null,
      updated_at: new Date().toISOString(),
    };
  } else if (event.type === BILLING_ISSUE) {
    // Keep access during Google's grace window; surface a banner on the client.
    update = {
      subscription_active: true,
      subscription_tier: resolvedTier,
      subscription_end: subscriptionEnd,
      billing_state: 'grace',
      grace_period_expires_at: subscriptionEnd,
      updated_at: new Date().toISOString(),
    };
  } else if (event.type === SUBSCRIPTION_PAUSED) {
    update = {
      subscription_active: false,
      subscription_tier: 'free',
      subscription_end: subscriptionEnd,
      billing_state: 'on_hold',
      grace_period_expires_at: null,
      updated_at: new Date().toISOString(),
    };
  }

  if (!update) {
    return new Response(JSON.stringify({ ignored: true, type: event.type }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: updated, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', userId)
    .select('id, subscription_tier, subscription_active');
  if (error) {
    console.error('Profile update failed', error);
    return new Response(JSON.stringify({ error: 'update_failed', detail: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  console.log(`RC ${event.type} for ${userId} → matched ${updated?.length ?? 0} row(s)`);

  return new Response(JSON.stringify({ ok: true, type: event.type, matched: updated?.length ?? 0, updated }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
