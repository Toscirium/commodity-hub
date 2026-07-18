import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';

const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((v) => v.toString(16).padStart(2, '0')).join('');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const raw = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!raw.startsWith('ch_live_')) return json({ error: 'api_key_required' }, 401);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: key } = await admin.from('data_api_keys').select('id,user_id').eq('key_hash', await hash(raw)).is('revoked_at', null).maybeSingle();
  if (!key) return json({ error: 'invalid_api_key' }, 401);
  await admin.from('data_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
  const url = new URL(req.url); const resource = url.searchParams.get('resource') ?? 'portfolio';
  if (resource === 'portfolio') {
    const { data, error } = await admin.from('portfolio_positions').select('commodity_name,quantity,entry_price,entry_date,notes,created_at').eq('user_id', key.user_id).order('created_at', { ascending: false });
    return error ? json({ error: 'data_unavailable' }, 500) : json({ data, generated_at: new Date().toISOString() });
  }
  if (resource === 'watchlists') {
    const { data, error } = await admin.from('watchlists').select('id,name,created_at,watchlist_items(commodity_name,commodity_symbol,position)').eq('user_id', key.user_id).order('created_at', { ascending: false });
    return error ? json({ error: 'data_unavailable' }, 500) : json({ data, generated_at: new Date().toISOString() });
  }
  return json({ error: 'unknown_resource' }, 404);
});
