// eToro OAuth 2.0 / OIDC handshake (Authorization Code + PKCE), scoped
// deliberately to demo-trading scopes only — see the migration's file-level
// comment for why. This function never talks to the eToro Trading API
// itself; supabase/functions/etoro-trading does that once a connection
// exists here.
//
// Flow:
//   1. Frontend calls action=start (authenticated). We generate PKCE
//      verifier/challenge + state + nonce, stash them server-side (10-min
//      TTL row in etoro_oauth_state, one-time use), and hand back the full
//      https://www.etoro.com/sso authorization URL. Frontend redirects the
//      whole page there — nothing PKCE-related ever touches the browser
//      beyond that redirect.
//   2. eToro redirects back to our own /etoro/callback?code=...&state=...
//      (a plain frontend route, not this function). That page POSTs
//      {code, state} to action=callback.
//   3. action=callback looks up the stashed verifier/nonce by state,
//      deletes the row (one-time use), exchanges the code for tokens
//      server-side (client_secret never leaves this function), verifies
//      the ID token against eToro's JWKS, and stores the encrypted
//      access/refresh tokens + eToro `sub` in etoro_connections for the
//      calling user.
//   4. action=disconnect revokes the refresh token at eToro and deletes
//      the connection row.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';
import { encryptToken, decryptToken } from '../_shared/etoroCrypto.ts';

const ETORO_AUTH_URL = 'https://www.etoro.com/sso';
const ETORO_TOKEN_URL = 'https://www.etoro.com/api/sso/v1/token';
const ETORO_REVOKE_URL = 'https://www.etoro.com/api/sso/v1/token/revoke';
const ETORO_JWKS_URL = 'https://www.etoro.com/.well-known/jwks.json';
const ETORO_ISSUER = 'https://www.etoro.com';

// Deliberately narrow: openid for the ID token, demo-only trade scopes, and
// read-only market data for instrument search/price display. Widening this
// to trade.real:* needs the legal/compliance sign-off discussed with the
// user before it happens, not just an engineering change.
const SCOPES = [
  'openid',
  'etoro-public:trade.demo:read',
  'etoro-public:trade.demo:write',
  'etoro-public:market-data:read',
].join(' ');

const jwks = createRemoteJWKSet(new URL(ETORO_JWKS_URL));

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function codeChallengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

Deno.serve(async (req) => {
  const logger = new EdgeLogger({ functionName: 'etoro-auth' });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    const clientId = Deno.env.get('ETORO_CLIENT_ID');
    const clientSecret = Deno.env.get('ETORO_CLIENT_SECRET');
    const redirectUri = Deno.env.get('ETORO_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) {
      return json({ error: 'eToro integration not configured (ETORO_CLIENT_ID/SECRET/REDIRECT_URI missing)' }, 503);
    }

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

    if (action === 'start') {
      const state = randomToken(24);
      const codeVerifier = randomToken(48);
      const nonce = randomToken(24);
      const codeChallenge = await codeChallengeFor(codeVerifier);

      try { await admin.rpc('etoro_oauth_state_cleanup' as never); } catch { /* best-effort sweep */ }
      const { error: insertErr } = await admin.from('etoro_oauth_state').insert({
        state, user_id: userId, code_verifier: codeVerifier, nonce,
      });
      if (insertErr) return json({ error: 'Could not start eToro connection', message: insertErr.message }, 500);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SCOPES,
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });
      return json({ authorizationUrl: `${ETORO_AUTH_URL}?${params.toString()}` });
    }

    if (action === 'callback') {
      const code = body?.code;
      const state = body?.state;
      if (typeof code !== 'string' || typeof state !== 'string') {
        return json({ error: 'Missing code/state' }, 400);
      }

      const { data: stateRow, error: stateErr } = await admin
        .from('etoro_oauth_state')
        .select('user_id, code_verifier, nonce, created_at')
        .eq('state', state)
        .maybeSingle();
      if (stateErr || !stateRow) return json({ error: 'Unknown or expired connection attempt' }, 400);
      // One-time use, regardless of outcome below — a code exchange can only
      // succeed once anyway (eToro invalidates it after first use).
      await admin.from('etoro_oauth_state').delete().eq('state', state);

      if (stateRow.user_id !== userId) {
        // Whoever started this flow must be who's completing it — the
        // callback page carries no other proof of that on its own.
        return json({ error: 'This connection attempt belongs to a different session' }, 403);
      }
      const startedAgeMs = Date.now() - new Date(stateRow.created_at).getTime();
      if (startedAgeMs > 15 * 60_000) return json({ error: 'Connection attempt expired, please try again' }, 400);

      const tokenRes = await fetch(ETORO_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: stateRow.code_verifier,
        }),
      });
      if (!tokenRes.ok) {
        const detail = await tokenRes.text().catch(() => '');
        logger.error('etoro token exchange failed', { status: tokenRes.status, detail: detail.slice(0, 500) });
        return json({ error: 'eToro rejected the connection attempt' }, 502);
      }
      const tokens = await tokenRes.json();
      const { access_token, refresh_token, id_token, expires_in, scope } = tokens ?? {};
      if (!access_token || !refresh_token || !id_token) {
        return json({ error: 'eToro token response was incomplete' }, 502);
      }

      let sub: string;
      try {
        const { payload } = await jwtVerify(id_token, jwks, {
          issuer: ETORO_ISSUER,
          audience: clientId,
          algorithms: ['RS256'],
          clockTolerance: 30,
        });
        if (payload.nonce !== stateRow.nonce) throw new Error('nonce mismatch');
        if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('missing sub');
        sub = payload.sub;
      } catch (err) {
        logger.error('etoro id_token verification failed', err);
        return json({ error: 'Could not verify eToro identity token' }, 502);
      }

      const [access, refresh] = await Promise.all([encryptToken(access_token), encryptToken(refresh_token)]);
      const expiresAt = new Date(Date.now() + (Number(expires_in) || 3600) * 1000).toISOString();

      const { error: upsertErr } = await admin.from('etoro_connections').upsert({
        user_id: userId,
        etoro_sub: sub,
        access_token_encrypted: access.ciphertext,
        access_token_iv: access.iv,
        refresh_token_encrypted: refresh.ciphertext,
        refresh_token_iv: refresh.iv,
        token_expires_at: expiresAt,
        scopes: typeof scope === 'string' ? scope : SCOPES,
        environment: 'demo',
      });
      if (upsertErr) return json({ error: 'Could not save eToro connection', message: upsertErr.message }, 500);

      return json({ connected: true });
    }

    if (action === 'disconnect') {
      const { data: row } = await admin
        .from('etoro_connections')
        .select('refresh_token_encrypted, refresh_token_iv')
        .eq('user_id', userId)
        .maybeSingle();

      if (row) {
        try {
          const refreshToken = await decryptToken({ ciphertext: row.refresh_token_encrypted, iv: row.refresh_token_iv });
          await fetch(ETORO_REVOKE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
            },
            body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' }),
          });
        } catch (err) {
          // Revoking at eToro is best-effort — the local row is what
          // actually gates our own API calls, so still delete it below even
          // if eToro's revoke endpoint is unreachable.
          logger.warn('etoro token revoke failed, deleting local connection anyway', String(err));
        }
      }

      await admin.from('etoro_connections').delete().eq('user_id', userId);
      return json({ disconnected: true });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (err) {
    logger.error('etoro-auth failed', err);
    return json({ error: 'eToro auth request failed', message: (err as Error).message }, 500);
  }
});
