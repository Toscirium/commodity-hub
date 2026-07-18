import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((v) => v.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const auth = req.headers.get('authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: profile } = await admin.from('profiles').select('subscription_active, subscription_tier').eq('id', user.id).maybeSingle();
  if (!profile?.subscription_active || profile.subscription_tier !== 'pro') return json({ error: 'pro_required' }, 403);
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action === 'list') {
    const [{ data: keys }, { data: schedules }] = await Promise.all([
      admin.from('data_api_keys').select('id,name,key_prefix,last_used_at,revoked_at,created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      admin.from('export_schedules').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]);
    return json({ keys: keys ?? [], schedules: schedules ?? [] });
  }
  if (action === 'create_key') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) return json({ error: 'invalid_name' }, 400);
    const rawKey = `ch_live_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const { data, error } = await admin.from('data_api_keys').insert({ user_id: user.id, name, key_prefix: rawKey.slice(0, 16), key_hash: await hash(rawKey) }).select('id,name,key_prefix,last_used_at,revoked_at,created_at').single();
    return error ? json({ error: 'key_creation_failed' }, 500) : json({ key: data, rawKey });
  }
  if (action === 'revoke_key') {
    const { error } = await admin.from('data_api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', body.id).eq('user_id', user.id);
    return error ? json({ error: 'key_revoke_failed' }, 500) : json({ ok: true });
  }
  if (action === 'save_schedule') {
    const input = body.schedule ?? {};
    if (!['portfolio', 'watchlists'].includes(input.dataset) || !['csv', 'xlsx'].includes(input.format) || !['daily', 'weekly', 'monthly'].includes(input.frequency)) return json({ error: 'invalid_schedule' }, 400);
    const payload = { user_id: user.id, name: String(input.name ?? '').trim().slice(0, 80), dataset: input.dataset, format: input.format, frequency: input.frequency, enabled: input.enabled !== false, updated_at: new Date().toISOString() };
    if (!payload.name) return json({ error: 'invalid_schedule' }, 400);
    const { error } = await admin.from('export_schedules').insert(payload);
    return error ? json({ error: 'schedule_save_failed' }, 500) : json({ ok: true });
  }
  if (action === 'delete_schedule') {
    const { error } = await admin.from('export_schedules').delete().eq('id', body.id).eq('user_id', user.id);
    return error ? json({ error: 'schedule_delete_failed' }, 500) : json({ ok: true });
  }
  return json({ error: 'invalid_action' }, 400);
});
