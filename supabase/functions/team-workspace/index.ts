import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// Team Workspace is a Pro-tier perk, not a separate SKU: one Pro subscriber
// owns a team, invites teammates (who don't need their own subscription),
// and everyone gets shared notes/approvals under the owner's Pro seat.
const SEAT_LIMIT = 5; // includes the owner
const MEMBER_ROLES = ['editor', 'viewer'] as const;

type Role = 'owner' | 'editor' | 'viewer';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // Resolves the caller's role on a team, or null if not a member.
  const roleOf = async (teamId: string): Promise<Role | null> => {
    const { data } = await admin.from('team_members').select('role').eq('team_id', teamId).eq('user_id', user.id).maybeSingle();
    return (data?.role as Role | undefined) ?? null;
  };

  if (action === 'list') {
    const { data: memberships } = await admin.from('team_members').select('team_id, role, teams(id,name,owner_id,created_at)').eq('user_id', user.id);
    type Membership = { role: Role; teams: { id: string; name: string; owner_id: string; created_at: string } | null };
    const teams = ((memberships ?? []) as unknown as Membership[]).map((m) => ({ ...m.teams, myRole: m.role }));
    return json({ teams });
  }

  if (action === 'create_team') {
    const { data: profile } = await admin.from('profiles').select('subscription_active, subscription_tier').eq('id', user.id).maybeSingle();
    if (!profile?.subscription_active || profile.subscription_tier !== 'pro') return json({ error: 'pro_required' }, 403);
    const { count } = await admin.from('teams').select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
    if ((count ?? 0) > 0) return json({ error: 'team_already_exists' }, 409); // one team per Pro seat for now
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 100) return json({ error: 'invalid_name' }, 400);
    const { data: team, error } = await admin.from('teams').insert({ owner_id: user.id, name }).select('id,name,owner_id,created_at').single();
    if (error) return json({ error: 'team_creation_failed' }, 500);
    await admin.from('team_members').insert({ team_id: team.id, user_id: user.id, role: 'owner' });
    return json({ team });
  }

  if (action === 'delete_team') {
    const teamId = body.team_id;
    const { data: team } = await admin.from('teams').select('owner_id').eq('id', teamId).maybeSingle();
    if (!team || team.owner_id !== user.id) return json({ error: 'owner_required' }, 403);
    const { error } = await admin.from('teams').delete().eq('id', teamId);
    return error ? json({ error: 'delete_failed' }, 500) : json({ ok: true });
  }

  if (action === 'team_detail') {
    const teamId = body.team_id;
    if (!(await roleOf(teamId))) return json({ error: 'not_a_member' }, 403);
    const [{ data: members }, { data: comments }] = await Promise.all([
      admin.from('team_members').select('user_id, role').eq('team_id', teamId),
      admin.from('team_comments').select('id, user_id, entity_type, entity_id, body, approval_state, created_at').eq('team_id', teamId).order('created_at', { ascending: false }).limit(200),
    ]);
    // team_members/team_comments reference auth.users, not profiles, so
    // PostgREST can't embed profiles() directly — join manually instead.
    const userIds = [...new Set([...(members ?? []).map((m) => m.user_id), ...(comments ?? []).map((c) => c.user_id)])];
    const { data: profiles } = userIds.length ? await admin.from('profiles').select('id, email, full_name').in('id', userIds) : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return json({
      members: (members ?? []).map((m) => ({ ...m, profile: byId.get(m.user_id) ?? null })),
      comments: (comments ?? []).map((c) => ({ ...c, profile: byId.get(c.user_id) ?? null })),
    });
  }

  if (action === 'invite_member') {
    const teamId = body.team_id;
    const { data: team } = await admin.from('teams').select('owner_id').eq('id', teamId).maybeSingle();
    if (!team || team.owner_id !== user.id) return json({ error: 'owner_required' }, 403);
    const role = MEMBER_ROLES.includes(body.role) ? body.role : 'viewer';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) return json({ error: 'email_required' }, 400);
    const { data: invitee } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle();
    if (!invitee) return json({ error: 'user_not_found' }, 404); // must already have an account
    const { count } = await admin.from('team_members').select('user_id', { count: 'exact', head: true }).eq('team_id', teamId);
    if ((count ?? 0) >= SEAT_LIMIT) return json({ error: 'seat_limit_reached', seatLimit: SEAT_LIMIT }, 403);
    const { error } = await admin.from('team_members').insert({ team_id: teamId, user_id: invitee.id, role });
    if (error) return json({ error: error.code === '23505' ? 'already_a_member' : 'invite_failed' }, error.code === '23505' ? 409 : 500);
    return json({ ok: true });
  }

  if (action === 'update_role') {
    const teamId = body.team_id;
    const { data: team } = await admin.from('teams').select('owner_id').eq('id', teamId).maybeSingle();
    if (!team || team.owner_id !== user.id) return json({ error: 'owner_required' }, 403);
    if (body.user_id === user.id) return json({ error: 'cannot_change_own_role' }, 400);
    if (!MEMBER_ROLES.includes(body.role)) return json({ error: 'invalid_role' }, 400);
    const { error } = await admin.from('team_members').update({ role: body.role }).eq('team_id', teamId).eq('user_id', body.user_id);
    return error ? json({ error: 'update_failed' }, 500) : json({ ok: true });
  }

  if (action === 'remove_member') {
    const teamId = body.team_id;
    const { data: team } = await admin.from('teams').select('owner_id').eq('id', teamId).maybeSingle();
    if (!team) return json({ error: 'not_found' }, 404);
    const isOwner = team.owner_id === user.id;
    const isSelf = body.user_id === user.id;
    if (!isOwner && !isSelf) return json({ error: 'owner_required' }, 403); // members may remove themselves (leave)
    if (body.user_id === team.owner_id) return json({ error: 'cannot_remove_owner' }, 400);
    const { error } = await admin.from('team_members').delete().eq('team_id', teamId).eq('user_id', body.user_id);
    return error ? json({ error: 'remove_failed' }, 500) : json({ ok: true });
  }

  if (action === 'add_comment') {
    const teamId = body.team_id;
    if (!(await roleOf(teamId))) return json({ error: 'not_a_member' }, 403);
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 4000) return json({ error: 'invalid_comment' }, 400);
    const entityType = typeof body.entity_type === 'string' && body.entity_type ? body.entity_type : 'note';
    const approvalState = body.needs_approval ? 'pending' : null;
    const { data, error } = await admin.from('team_comments').insert({ team_id: teamId, user_id: user.id, entity_type: entityType, entity_id: body.entity_id ?? null, body: text, approval_state: approvalState }).select('id,user_id,entity_type,entity_id,body,approval_state,created_at').single();
    return error ? json({ error: 'comment_failed' }, 500) : json({ comment: data });
  }

  if (action === 'set_approval_state') {
    const teamId = body.team_id;
    const role = await roleOf(teamId);
    if (role !== 'owner' && role !== 'editor') return json({ error: 'editor_required' }, 403);
    if (!['approved', 'rejected', 'pending'].includes(body.approval_state)) return json({ error: 'invalid_state' }, 400);
    const { error } = await admin.from('team_comments').update({ approval_state: body.approval_state }).eq('id', body.comment_id).eq('team_id', teamId);
    return error ? json({ error: 'update_failed' }, 500) : json({ ok: true });
  }

  return json({ error: 'invalid_action' }, 400);
});
