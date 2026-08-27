// Admin-only usage analytics for the Data API product (per-key request
// volume, adoption among Pro subscribers, resource popularity). Reads
// data_api_usage_daily (20260827150000_data_api_usage_tracking.sql), which
// data-api/index.ts writes to on every authorized request.
//
// Same admin-gate pattern as audit-premium-freshness: accept either
// service_role or a user JWT carrying the 'admin' role.
//
// Purpose: give the app owner real usage data (who's actually calling the
// API, how often, which resources) to inform whether/how to introduce a
// dedicated paid API tier — see monetization-backlog item #4.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/utils.ts';

const DAYS_OF_HISTORY = 365; // effectively "all time" — the table only exists as of 2026-08-27

interface UsageRow {
  key_id: string;
  day: string;
  resource: string;
  request_count: number;
}
interface KeyRow {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
interface ProfileRow {
  id: string;
  email: string;
  subscription_tier: string | null;
  subscription_active: boolean | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Admin gate: accept either service_role or a user JWT with admin role.
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
      const { data: roleRow } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (roleRow) isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const sinceDay = new Date(Date.now() - DAYS_OF_HISTORY * 86_400_000).toISOString().slice(0, 10);
  const [keysRes, usageRes] = await Promise.all([
    admin
      .from('data_api_keys')
      .select('id, user_id, name, key_prefix, created_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false }),
    admin
      .from('data_api_usage_daily')
      .select('key_id, day, resource, request_count')
      .gte('day', sinceDay),
  ]);

  if (keysRes.error || usageRes.error) {
    return new Response(
      JSON.stringify({ error: 'query_failed', detail: (keysRes.error ?? usageRes.error)?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const keys = (keysRes.data ?? []) as KeyRow[];
  const usage = (usageRes.data ?? []) as UsageRow[];

  const userIds = Array.from(new Set(keys.map((k) => k.user_id)));
  const { data: profileRows } = userIds.length
    ? await admin
        .from('profiles')
        .select('id, email, subscription_tier, subscription_active')
        .in('id', userIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map((profileRows ?? []).map((p: ProfileRow) => [p.id, p]));

  const today = new Date();
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
  const day7Cutoff = daysAgo(7);
  const day30Cutoff = daysAgo(30);

  // Daily totals for the last 30 days, zero-filled so the chart has no gaps.
  const dailyTotals = new Map<string, number>();
  for (let i = 29; i >= 0; i--) dailyTotals.set(daysAgo(i), 0);
  const byResourceTotals = new Map<string, number>();
  const byKey = new Map<string, { requests_7d: number; requests_30d: number; requests_all_time: number }>();

  for (const row of usage) {
    const stats = byKey.get(row.key_id) ?? { requests_7d: 0, requests_30d: 0, requests_all_time: 0 };
    stats.requests_all_time += row.request_count;
    if (row.day >= day30Cutoff) stats.requests_30d += row.request_count;
    if (row.day >= day7Cutoff) stats.requests_7d += row.request_count;
    byKey.set(row.key_id, stats);

    if (row.day >= day30Cutoff) {
      byResourceTotals.set(row.resource, (byResourceTotals.get(row.resource) ?? 0) + row.request_count);
      if (dailyTotals.has(row.day)) dailyTotals.set(row.day, (dailyTotals.get(row.day) ?? 0) + row.request_count);
    }
  }

  const keyReports = keys
    .map((k) => {
      const profile = profileById.get(k.user_id);
      const stats = byKey.get(k.id) ?? { requests_7d: 0, requests_30d: 0, requests_all_time: 0 };
      return {
        key_id: k.id,
        name: k.name,
        key_prefix: k.key_prefix,
        owner_email: profile?.email ?? null,
        owner_tier: profile?.subscription_tier ?? null,
        owner_active: profile?.subscription_active ?? null,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        revoked: k.revoked_at !== null,
        ...stats,
      };
    })
    .sort((a, b) => b.requests_30d - a.requests_30d);

  const activeProUserIds = new Set(
    (profileRows ?? [])
      .filter((p: ProfileRow) => p.subscription_active && p.subscription_tier === 'pro')
      .map((p: ProfileRow) => p.id),
  );

  const { count: totalProSubscribers } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_tier', 'pro')
    .eq('subscription_active', true);

  const summary = {
    total_keys: keys.length,
    revoked_keys: keys.filter((k) => k.revoked_at !== null).length,
    active_keys_30d: keyReports.filter((k) => k.requests_30d > 0).length,
    pro_subscribers_total: totalProSubscribers ?? null,
    // Distinct current-Pro users who have created at least one (any-status) key.
    pro_subscribers_with_key: new Set(
      keys.filter((k) => activeProUserIds.has(k.user_id)).map((k) => k.user_id),
    ).size,
  };

  return new Response(
    JSON.stringify({
      summary,
      daily: Array.from(dailyTotals.entries()).map(([day, requests]) => ({ day, requests })),
      by_resource: Array.from(byResourceTotals.entries())
        .map(([resource, requests]) => ({ resource, requests }))
        .sort((a, b) => b.requests - a.requests),
      keys: keyReports,
      generated_at: new Date().toISOString(),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
