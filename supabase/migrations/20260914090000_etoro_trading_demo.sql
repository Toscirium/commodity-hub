-- eToro Builders API integration (demo trading only — see
-- src/pages/EtoroTrading.tsx and supabase/functions/etoro-auth,
-- supabase/functions/etoro-trading for the full rationale). Deliberately
-- scoped to etoro-public:trade.demo:* OAuth scopes only: this app is
-- marketed everywhere (llms.txt, terms, TradeCTA) as "not a broker" and
-- real-money order execution/routing is MiFID II-adjacent territory that
-- needs its own legal sign-off before any code here ever requests a
-- trade.real:* scope. Do not widen scope requests without that in hand.

-- One row per Commodity Hub user who has connected an eToro account via
-- OAuth. Tokens are encrypted at rest (AES-256-GCM, ETORO_TOKEN_ENCRYPTION_KEY
-- edge function secret) the same way message bodies are — see
-- supabase/functions/_shared/etoroCrypto.ts — this is encryption against a
-- raw DB dump, not E2EE; the server can still decrypt to call the API on
-- the user's behalf, same tradeoff as messaging.
CREATE TABLE public.etoro_connections (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- eToro's stable pairwise identifier for this user+client (their `sub`
  -- claim) — NOT an email/name, and deliberately not usable to look up a
  -- real-world identity from our side. Unique per (user, our client_id),
  -- but since we have exactly one client_id, unique per user is equivalent.
  etoro_sub TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  -- Space-separated OAuth scope string as granted, e.g.
  -- "openid etoro-public:trade.demo:read etoro-public:trade.demo:write
  -- etoro-public:market-data:read". Recorded so a UI can show exactly what
  -- was authorized without re-deriving it, and so a future scope-widening
  -- migration has something to diff against.
  scopes TEXT NOT NULL,
  -- Always 'demo' for now — see the file-level comment. A CHECK constraint
  -- rather than an enum so widening to 'real' later is a one-line migration,
  -- not a type change; the real gate is the scopes column itself.
  environment TEXT NOT NULL DEFAULT 'demo' CHECK (environment = 'demo'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX etoro_connections_sub_idx ON public.etoro_connections (etoro_sub);

ALTER TABLE public.etoro_connections ENABLE ROW LEVEL SECURITY;

-- Users can see that they're connected (for UI state) but never the token
-- columns via a client query — the edge functions read those with the
-- service role, never exposed through PostgREST to the browser. A SELECT
-- policy still technically exposes the encrypted+IV columns to the owning
-- user over PostgREST; that's ciphertext without the server-held key, so
-- it's not a real disclosure, but the edge functions never rely on the
-- anon/authenticated path to read tokens regardless.
CREATE POLICY "Users can view their own eToro connection"
  ON public.etoro_connections FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated/anon — connecting and
-- disconnecting both go through etoro-auth (service role), never a direct
-- client write, so the OAuth code exchange and token refresh logic can't be
-- bypassed by writing a row directly.

CREATE TRIGGER etoro_connections_updated_at
  BEFORE UPDATE ON public.etoro_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON public.etoro_connections FROM PUBLIC, anon;
GRANT SELECT ON public.etoro_connections TO authenticated;
GRANT ALL ON public.etoro_connections TO service_role;

-- Short-lived PKCE/state storage for the OAuth handshake. One row per
-- in-flight "Connect eToro" attempt, deleted immediately on successful
-- callback (one-time use, see etoro-auth) and swept of anything stale by
-- etoro_oauth_state_cleanup() below. Keeping code_verifier server-side
-- (rather than round-tripping it through the browser/sessionStorage) means
-- the callback page never needs to reconstruct PKCE state itself — it just
-- forwards `code` + `state` to etoro-auth.
CREATE TABLE public.etoro_oauth_state (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.etoro_oauth_state ENABLE ROW LEVEL SECURITY;
-- No policies at all: this table is service-role-only, start-to-finish, by
-- design — RLS with zero policies denies every request from anon/authenticated.
REVOKE ALL ON public.etoro_oauth_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.etoro_oauth_state TO service_role;

CREATE OR REPLACE FUNCTION public.etoro_oauth_state_cleanup()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.etoro_oauth_state WHERE created_at < now() - interval '15 minutes';
$$;

REVOKE ALL ON FUNCTION public.etoro_oauth_state_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.etoro_oauth_state_cleanup() TO service_role;

-- eToro instrumentIds are global/static (not per-user), but eToro's own
-- search endpoint that resolves a commodity name to one requires an
-- already-authenticated user context (x-user-key/bearer) — there's no
-- app-level lookup. Rather than hardcode instrumentId numbers we have no
-- way to verify without live API credentials, this caches whatever the
-- FIRST connected user's search resolves for each of our commodity_key
-- values (see PRODUCTS in massive-client.ts for the key set), and every
-- later order for that commodity — by any user — reuses the cached id
-- instead of re-searching. See supabase/functions/etoro-trading/index.ts.
CREATE TABLE public.etoro_instrument_cache (
  commodity_key TEXT PRIMARY KEY,
  instrument_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.etoro_instrument_cache ENABLE ROW LEVEL SECURITY;
-- Read-only reference data, safe for any signed-in user (no PII) — same
-- shape as cot_reports/vessel_positions. Writes are service-role-only
-- (etoro-trading resolves+inserts on a cache miss).
CREATE POLICY "Signed-in users can read the eToro instrument cache"
  ON public.etoro_instrument_cache FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON public.etoro_instrument_cache FROM PUBLIC, anon;
GRANT SELECT ON public.etoro_instrument_cache TO authenticated;
GRANT ALL ON public.etoro_instrument_cache TO service_role;
