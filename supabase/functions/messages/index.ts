import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from '../_shared/utils.ts';
import { IpRateLimiter } from '../_shared/rateLimit.ts';
import { sendFcmToTokens } from '../_shared/fcm.ts';
import { encryptBody, decryptRow } from '../_shared/messageCrypto.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

// --- Rate limiting ---
// IpRateLimiter's counter is per-isolate in-memory. That's fine for casual
// abuse from one client hammering sequentially, but end-to-end testing
// against the deployed function showed it does NOT hold up: 100 concurrent
// sends from one user, 0 rate-limited. Supabase's edge runtime spins up
// separate isolates for concurrent requests, so a burst spammer never
// accumulates enough hits on any single isolate's counter to trip it.
// `send` is the real abuse vector (message spam), so it gets a DB-backed
// check instead — a COUNT query against `messages` is consistent across
// every isolate because it reads from the one shared Postgres instance.
// `report_message` gets the same treatment since the table already has
// what's needed (reporter_id + created_at). `start_conversation` is lower
// severity (no content sent, just a conversation row) and there's no
// existing "who created this conversation, when" column to count against
// without a schema change, so it stays on the in-memory limiter — best
// effort, not a hard guarantee.
const startLimiter = new IpRateLimiter({ limit: 10, windowMs: 60_000 });

const withinLast = (ms: number) => new Date(Date.now() - ms).toISOString();

const dbRateLimited = async (admin: SupabaseClient, table: string, column: string, userId: string, limit: number, windowMs: number): Promise<boolean> => {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq(column, userId).gt('created_at', withinLast(windowMs));
  return (count ?? 0) >= limit;
};

const displayName = (p: { full_name: string | null; email: string } | null | undefined) =>
  p?.full_name || p?.email?.split('@')[0] || 'Unknown';

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

  const isMember = async (conversationId: string): Promise<boolean> => {
    const { data } = await admin.from('conversation_members').select('user_id').eq('conversation_id', conversationId).eq('user_id', user.id).maybeSingle();
    return Boolean(data);
  };

  const isBlocked = async (a: string, b: string): Promise<boolean> => {
    const { data } = await admin.from('blocked_users').select('blocker_id').or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).limit(1);
    return (data?.length ?? 0) > 0;
  };

  const otherMemberIds = async (conversationId: string): Promise<string[]> => {
    const { data } = await admin.from('conversation_members').select('user_id').eq('conversation_id', conversationId).neq('user_id', user.id);
    return (data ?? []).map((m) => m.user_id);
  };

  if (action === 'search_users') {
    const rawTerm = (typeof body.search_text === 'string' ? body.search_text : '').trim().slice(0, 80);
    if (rawTerm.length < 2) return json({ people: [] });
    // PostgREST's .or() filter string treats ',', '(', ')' as syntax, and
    // ILIKE treats '%'/'_' as wildcards — strip all of that from
    // user-supplied input rather than let a name like "Smith, John" break
    // the filter or "%" turn into a match-everything search.
    const term = rawTerm.replace(/[,()%_]/g, '');
    if (term.length < 2) return json({ people: [] });
    const { data: blockedRows } = await admin.from('blocked_users').select('blocker_id, blocked_id').or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
    const excluded = new Set((blockedRows ?? []).map((r) => (r.blocker_id === user.id ? r.blocked_id : r.blocker_id)));
    const { data: people } = await admin.from('profiles').select('id, full_name, avatar_url, email').neq('id', user.id).or(`full_name.ilike.%${term}%,email.ilike.%${term}%`).order('full_name', { ascending: true, nullsFirst: false }).limit(20);
    const filtered = (people ?? []).filter((p) => !excluded.has(p.id)).slice(0, 12).map((p) => ({ id: p.id, display_name: displayName(p), avatar_url: p.avatar_url }));
    return json({ people: filtered });
  }

  if (action === 'start_conversation') {
    const limit = startLimiter.check(user.id);
    if (!limit.allowed) return json({ error: 'rate_limited', retryAfterSeconds: limit.retryAfterSeconds }, 429);
    const recipientId = body.recipient_id;
    if (!recipientId || recipientId === user.id) return json({ error: 'invalid_recipient' }, 400);
    const { data: recipient } = await admin.from('profiles').select('id').eq('id', recipientId).maybeSingle();
    if (!recipient) return json({ error: 'recipient_not_found' }, 404);
    if (await isBlocked(user.id, recipientId)) return json({ error: 'blocked' }, 403);

    const [lowId, highId] = [user.id, recipientId].sort();
    const { data: existingKey } = await admin.from('direct_conversation_keys').select('conversation_id').eq('user_low_id', lowId).eq('user_high_id', highId).maybeSingle();
    if (existingKey) return json({ conversation_id: existingKey.conversation_id });

    const { data: conversation, error: convErr } = await admin.from('conversations').insert({}).select('id').single();
    if (convErr) return json({ error: 'start_failed' }, 500);
    const { error: keyErr } = await admin.from('direct_conversation_keys').insert({ user_low_id: lowId, user_high_id: highId, conversation_id: conversation.id });
    if (keyErr) {
      // Lost a race with a concurrent start_conversation — reuse the winner's row instead of leaving an orphan conversation.
      const { data: winner } = await admin.from('direct_conversation_keys').select('conversation_id').eq('user_low_id', lowId).eq('user_high_id', highId).maybeSingle();
      await admin.from('conversations').delete().eq('id', conversation.id);
      if (winner) return json({ conversation_id: winner.conversation_id });
      return json({ error: 'start_failed' }, 500);
    }
    await admin.from('conversation_members').insert([{ conversation_id: conversation.id, user_id: user.id }, { conversation_id: conversation.id, user_id: recipientId }]);
    return json({ conversation_id: conversation.id });
  }

  if (action === 'list_conversations') {
    const { data: memberships } = await admin.from('conversation_members').select('conversation_id, last_read_at').eq('user_id', user.id);
    if (!memberships?.length) return json({ conversations: [] });
    const convIds = memberships.map((m) => m.conversation_id);
    const readAt = new Map(memberships.map((m) => [m.conversation_id, m.last_read_at]));

    const { data: otherRows } = await admin.from('conversation_members').select('conversation_id, user_id').in('conversation_id', convIds).neq('user_id', user.id);
    const otherByConv = new Map((otherRows ?? []).map((r) => [r.conversation_id, r.user_id]));
    const otherIds = [...new Set([...otherByConv.values()])];
    const { data: profiles } = otherIds.length ? await admin.from('profiles').select('id, full_name, avatar_url, email').in('id', otherIds) : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

    const { data: recentMessages } = await admin.from('messages').select('conversation_id, body, iv, encrypted, sender_id, created_at').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(500);
    const latestByConv = new Map<string, { body: string; iv: string | null; encrypted: boolean; created_at: string }>();
    for (const m of recentMessages ?? []) if (!latestByConv.has(m.conversation_id)) latestByConv.set(m.conversation_id, m);

    const conversations = await Promise.all(convIds.map(async (id) => {
      const other = profileById.get(otherByConv.get(id) ?? '');
      const latest = latestByConv.get(id);
      const [lastMessage, unread] = await Promise.all([
        latest ? decryptRow(latest) : null,
        admin.from('messages').select('id', { count: 'exact', head: true }).eq('conversation_id', id).neq('sender_id', user.id).gt('created_at', readAt.get(id) ?? '1970-01-01'),
      ]);
      return {
        conversation_id: id,
        participant_id: otherByConv.get(id) ?? null,
        participant_name: displayName(other),
        participant_avatar_url: other?.avatar_url ?? null,
        last_message: lastMessage,
        last_message_at: latest?.created_at ?? null,
        unread_count: unread.count ?? 0,
      };
    }));
    conversations.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
    return json({ conversations });
  }

  if (action === 'list_messages') {
    const conversationId = body.conversation_id;
    if (!(await isMember(conversationId))) return json({ error: 'not_a_member' }, 403);
    const { data: rows, error } = await admin.from('messages').select('id, sender_id, body, iv, encrypted, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(250);
    if (error) return json({ error: 'load_failed' }, 500);
    const senderIds = [...new Set((rows ?? []).map((r) => r.sender_id))];
    const { data: profiles } = senderIds.length ? await admin.from('profiles').select('id, full_name, email').in('id', senderIds) : { data: [] };
    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    const messages = await Promise.all((rows ?? []).map(async (r) => ({
      id: r.id,
      sender_id: r.sender_id,
      sender_name: displayName(profileById.get(r.sender_id)),
      body: await decryptRow(r),
      created_at: r.created_at,
    })));
    return json({ messages });
  }

  if (action === 'send') {
    if (await dbRateLimited(admin, 'messages', 'sender_id', user.id, 20, 60_000)) return json({ error: 'rate_limited' }, 429);
    const conversationId = body.conversation_id;
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 4000) return json({ error: 'invalid_message' }, 400);
    if (!(await isMember(conversationId))) return json({ error: 'not_a_member' }, 403);
    const recipients = await otherMemberIds(conversationId);
    for (const recipientId of recipients) {
      if (await isBlocked(user.id, recipientId)) return json({ error: 'blocked' }, 403);
    }

    const { body: cipherBody, iv } = await encryptBody(text);
    const { data: row, error } = await admin.from('messages').insert({ conversation_id: conversationId, sender_id: user.id, body: cipherBody, iv, encrypted: true }).select('id, created_at').single();
    if (error) return json({ error: 'send_failed' }, 500);

    const { data: myProfile } = await admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle();

    // Push notification — deliberately no message preview text in the
    // payload. That text passes through Google's FCM servers unencrypted
    // regardless of our at-rest DB encryption, so putting the plaintext
    // there would quietly undercut the point of encrypting it.
    if (recipients.length > 0) {
      try {
        const { data: tokens } = await admin.from('device_tokens').select('token').in('user_id', recipients);
        const tokenList = (tokens ?? []).map((t) => t.token);
        if (tokenList.length > 0) {
          const result = await sendFcmToTokens(tokenList, {
            title: displayName(myProfile),
            body: 'Sent you a message',
            data: { type: 'message', conversation_id: conversationId },
          });
          if (result.invalidTokens.length > 0) await admin.from('device_tokens').delete().in('token', result.invalidTokens);
        }
      } catch { /* push is best-effort; never fail the send over it */ }
    }

    return json({ message: { id: row.id, sender_id: user.id, sender_name: displayName(myProfile), body: text, created_at: row.created_at } });
  }

  if (action === 'mark_read') {
    await admin.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', body.conversation_id).eq('user_id', user.id);
    return json({ ok: true });
  }

  if (action === 'block_user') {
    const blockedId = body.user_id;
    if (!blockedId || blockedId === user.id) return json({ error: 'invalid_user' }, 400);
    const { error } = await admin.from('blocked_users').insert({ blocker_id: user.id, blocked_id: blockedId });
    if (error && error.code !== '23505') return json({ error: 'block_failed' }, 500);
    return json({ ok: true });
  }

  if (action === 'unblock_user') {
    await admin.from('blocked_users').delete().eq('blocker_id', user.id).eq('blocked_id', body.user_id);
    return json({ ok: true });
  }

  if (action === 'list_blocked') {
    const { data: rows } = await admin.from('blocked_users').select('blocked_id').eq('blocker_id', user.id);
    const ids = (rows ?? []).map((r) => r.blocked_id);
    const { data: profiles } = ids.length ? await admin.from('profiles').select('id, full_name, email, avatar_url').in('id', ids) : { data: [] };
    return json({ blocked: (profiles ?? []).map((p) => ({ id: p.id, display_name: displayName(p), avatar_url: p.avatar_url })) });
  }

  if (action === 'report_message') {
    if (await dbRateLimited(admin, 'message_reports', 'reporter_id', user.id, 10, 60_000)) return json({ error: 'rate_limited' }, 429);
    const messageId = body.message_id;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 500) return json({ error: 'invalid_reason' }, 400);
    const { data: msg } = await admin.from('messages').select('conversation_id').eq('id', messageId).maybeSingle();
    if (!msg || !(await isMember(msg.conversation_id))) return json({ error: 'not_a_member' }, 403);
    const { error } = await admin.from('message_reports').insert({ reporter_id: user.id, message_id: messageId, reason });
    return error ? json({ error: 'report_failed' }, 500) : json({ ok: true });
  }

  return json({ error: 'invalid_action' }, 400);
});
