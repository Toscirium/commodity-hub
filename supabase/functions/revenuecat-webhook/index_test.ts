import 'https://deno.land/std@0.224.0/dotenv/load.ts';
import {
  assertEquals,
  assert,
} from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('VITE_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';

// DB-touching tests require the service role key, which lives only as a
// server-side secret. When running locally without it, skip them so the
// handler-level tests still validate behavior.
const DB_TESTS_ENABLED = Boolean(SERVICE_KEY && WEBHOOK_AUTH);

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/revenuecat-webhook`;

const adminClient = () => createClient(SUPABASE_URL, SERVICE_KEY);

const newTestUserId = () => crypto.randomUUID();

async function seedProfile(id: string) {
  const sb = adminClient();
  // Profiles table requires email; insert directly bypassing auth via service role.
  const { error } = await sb.from('profiles').insert({
    id,
    email: `rc-test-${id}@example.com`,
    full_name: 'RC Test',
    subscription_tier: 'free',
    subscription_active: false,
    billing_state: 'none',
  });
  if (error) throw new Error(`seed failed: ${error.message}`);
}

async function deleteProfile(id: string) {
  const sb = adminClient();
  await sb.from('profiles').delete().eq('id', id);
}

async function readProfile(id: string) {
  const sb = adminClient();
  const { data, error } = await sb
    .from('profiles')
    .select('subscription_active, subscription_tier, billing_state, grace_period_expires_at')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function post(body: unknown, opts: { auth?: string; method?: string } = {}) {
  return fetch(WEBHOOK_URL, {
    method: opts.method ?? 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: opts.auth ?? `Bearer ${WEBHOOK_AUTH}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const eventFor = (
  type: string,
  userId: string,
  extra: Record<string, unknown> = {},
) => ({
  event: {
    type,
    app_user_id: userId,
    entitlement_ids: ['premium'],
    expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
    ...extra,
  },
});

Deno.test('rejects without auth header', async () => {
  const res = await post(eventFor('INITIAL_PURCHASE', newTestUserId()), { auth: '' });
  assertEquals(res.status, 401);
  await res.text();
});

Deno.test('rejects non-POST method', async () => {
  const res = await fetch(WEBHOOK_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${WEBHOOK_AUTH}` },
  });
  assertEquals(res.status, 405);
  await res.text();
});

Deno.test('rejects invalid JSON', async () => {
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${WEBHOOK_AUTH}`,
    },
    body: '{not-json',
  });
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test('rejects missing required fields', async () => {
  const res = await post({ event: { type: 'RENEWAL' } });
  assertEquals(res.status, 400);
  await res.text();
});

Deno.test('ignores non-premium entitlement events', async () => {
  const res = await post({
    event: {
      type: 'INITIAL_PURCHASE',
      app_user_id: 'irrelevant',
      entitlement_ids: ['some_other_tier'],
    },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ignored, true);
});

Deno.test({
  name: 'INITIAL_PURCHASE activates premium and sets billing_state=active',
  ignore: !DB_TESTS_ENABLED,
  fn: async () => {
  const uid = newTestUserId();
  await seedProfile(uid);
  try {
    const res = await post(eventFor('INITIAL_PURCHASE', uid));
    assertEquals(res.status, 200);
    await res.text();
    const p = await readProfile(uid);
    assertEquals(p.subscription_active, true);
    assertEquals(p.subscription_tier, 'premium');
    assertEquals(p.billing_state, 'active');
    assertEquals(p.grace_period_expires_at, null);
  } finally {
    await deleteProfile(uid);
  }
  },
});

Deno.test({
  name: 'CANCELLATION deactivates and sets billing_state=canceled',
  ignore: !DB_TESTS_ENABLED,
  fn: async () => {
  const uid = newTestUserId();
  await seedProfile(uid);
  try {
    await post(eventFor('INITIAL_PURCHASE', uid)).then((r) => r.text());
    const res = await post(eventFor('CANCELLATION', uid));
    assertEquals(res.status, 200);
    await res.text();
    const p = await readProfile(uid);
    assertEquals(p.subscription_active, false);
    assertEquals(p.subscription_tier, 'free');
    assertEquals(p.billing_state, 'canceled');
  } finally {
    await deleteProfile(uid);
  }
  },
});

Deno.test({
  name: 'BILLING_ISSUE keeps access and enters grace period',
  ignore: !DB_TESTS_ENABLED,
  fn: async () => {
  const uid = newTestUserId();
  await seedProfile(uid);
  try {
    await post(eventFor('INITIAL_PURCHASE', uid)).then((r) => r.text());
    const res = await post(eventFor('BILLING_ISSUE', uid));
    assertEquals(res.status, 200);
    await res.text();
    const p = await readProfile(uid);
    assertEquals(p.subscription_active, true);
    assertEquals(p.billing_state, 'grace');
    assert(p.grace_period_expires_at !== null, 'grace_period_expires_at should be set');
  } finally {
    await deleteProfile(uid);
  }
  },
});

Deno.test({
  name: 'SUBSCRIPTION_PAUSED puts subscription on hold',
  ignore: !DB_TESTS_ENABLED,
  fn: async () => {
  const uid = newTestUserId();
  await seedProfile(uid);
  try {
    await post(eventFor('INITIAL_PURCHASE', uid)).then((r) => r.text());
    const res = await post(eventFor('SUBSCRIPTION_PAUSED', uid));
    assertEquals(res.status, 200);
    await res.text();
    const p = await readProfile(uid);
    assertEquals(p.subscription_active, false);
    assertEquals(p.billing_state, 'on_hold');
  } finally {
    await deleteProfile(uid);
  }
  },
});

Deno.test({
  name: 'UNCANCELLATION after grace clears billing state',
  ignore: !DB_TESTS_ENABLED,
  fn: async () => {
  const uid = newTestUserId();
  await seedProfile(uid);
  try {
    await post(eventFor('INITIAL_PURCHASE', uid)).then((r) => r.text());
    await post(eventFor('BILLING_ISSUE', uid)).then((r) => r.text());
    const res = await post(eventFor('UNCANCELLATION', uid));
    assertEquals(res.status, 200);
    await res.text();
    const p = await readProfile(uid);
    assertEquals(p.billing_state, 'active');
    assertEquals(p.grace_period_expires_at, null);
  } finally {
    await deleteProfile(uid);
  }
  },
});

Deno.test('unknown event type is ignored', async () => {
  const res = await post(eventFor('SOME_FUTURE_EVENT', newTestUserId()));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ignored, true);
});