// Shared helper for calling eToro's public Trading/Market-Data API on
// behalf of an already-connected Commodity Hub user (see etoro-auth for how
// the connection is established). Used by etoro-trading; kept separate from
// etoro-auth so the OAuth handshake and the day-to-day API calls don't share
// one large file.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { encryptToken, decryptToken } from './etoroCrypto.ts';

const ETORO_API_BASE = 'https://public-api.etoro.com';
const ETORO_TOKEN_URL = 'https://www.etoro.com/api/sso/v1/token';

export interface EtoroConnectionRow {
  access_token_encrypted: string;
  access_token_iv: string;
  refresh_token_encrypted: string;
  refresh_token_iv: string;
  token_expires_at: string;
}

/**
 * Loads the caller's eToro connection and returns a live access token,
 * refreshing it first if it's expired (or close to it — 60s of slack so a
 * token that's valid when checked doesn't expire mid-request). Persists the
 * refreshed tokens back to etoro_connections. Returns null if the user has
 * no connection at all (caller should surface "not connected").
 */
export async function getLiveAccessToken(
  admin: SupabaseClient<any, any, any>,
  userId: string,
): Promise<string | null> {
  const { data: row, error } = await admin
    .from('etoro_connections')
    .select('access_token_encrypted, access_token_iv, refresh_token_encrypted, refresh_token_iv, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle<EtoroConnectionRow>();
  if (error || !row) return null;

  const expiresAt = new Date(row.token_expires_at).getTime();
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() > 60_000) {
    return decryptToken({ ciphertext: row.access_token_encrypted, iv: row.access_token_iv });
  }

  // Expired (or about to be) — refresh. Requires the app credentials, same
  // as the initial code exchange.
  const clientId = Deno.env.get('ETORO_CLIENT_ID')!;
  const clientSecret = Deno.env.get('ETORO_CLIENT_SECRET')!;
  const refreshToken = await decryptToken({ ciphertext: row.refresh_token_encrypted, iv: row.refresh_token_iv });

  const res = await fetch(ETORO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) return null; // caller treats this as "not connected" and prompts a reconnect
  const tokens = await res.json();
  const { access_token, refresh_token: newRefresh, expires_in } = tokens ?? {};
  if (!access_token) return null;

  const [access, refresh] = await Promise.all([
    encryptToken(access_token),
    // eToro may or may not rotate the refresh token on refresh; keep the
    // existing one encrypted-as-is if a new one wasn't issued.
    newRefresh ? encryptToken(newRefresh) : Promise.resolve(null),
  ]);
  const expiresAtIso = new Date(Date.now() + (Number(expires_in) || 3600) * 1000).toISOString();

  await admin
    .from('etoro_connections')
    .update({
      access_token_encrypted: access.ciphertext,
      access_token_iv: access.iv,
      token_expires_at: expiresAtIso,
      ...(refresh ? { refresh_token_encrypted: refresh.ciphertext, refresh_token_iv: refresh.iv } : {}),
    })
    .eq('user_id', userId);

  return access_token;
}

/** GET/POST wrapper against eToro's public API with the required per-request headers. */
export async function etoroFetch(
  accessToken: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(`${ETORO_API_BASE}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-request-id': crypto.randomUUID(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/**
 * Resolves a commodity to its eToro instrumentId, checking
 * etoro_instrument_cache first (global, not per-user — see the migration's
 * comment) and falling back to eToro's own search endpoint on a cache miss,
 * using the CALLING user's own token (the search endpoint needs a user
 * context; there's no app-level lookup). The first user to trade a given
 * commodity resolves and caches it for everyone after.
 */
export async function resolveInstrumentId(
  admin: SupabaseClient<any, any, any>,
  accessToken: string,
  commodityKey: string,
  searchQuery: string,
): Promise<{ instrumentId: number; displayName: string } | null> {
  const { data: cached } = await admin
    .from('etoro_instrument_cache')
    .select('instrument_id, display_name')
    .eq('commodity_key', commodityKey)
    .maybeSingle<{ instrument_id: number; display_name: string }>();
  if (cached) return { instrumentId: cached.instrument_id, displayName: cached.display_name };

  const search = await etoroFetch(
    accessToken,
    `/api/v2/market-data/instruments/search?${new URLSearchParams({ query: searchQuery, limit: '5' })}`,
  );
  const results = Array.isArray(search.data?.results) ? search.data.results : [];
  const top = results[0];
  if (!search.ok || !top?.instrumentId) return null;

  await admin.from('etoro_instrument_cache').insert({
    commodity_key: commodityKey,
    instrument_id: top.instrumentId,
    display_name: String(top.displayName ?? searchQuery),
  }).select().maybeSingle(); // best-effort; a races-to-insert duplicate just hits the PK and is ignored below

  return { instrumentId: top.instrumentId, displayName: String(top.displayName ?? searchQuery) };
}
