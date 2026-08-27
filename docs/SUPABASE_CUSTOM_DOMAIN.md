# Moving Supabase to a custom domain

## Why

Web Google sign-in currently bounces through
`https://kcxhsmlqqyarhlmcapmj.supabase.co/auth/v1/callback`, which is visible
in the URL bar during the OAuth flow. A random-looking domain in the middle of
a sign-in is a scam signal to users. A custom domain (e.g.
`https://auth.commodity-hub.eu`) keeps the whole flow on our brand.

**Scope note:** this affects **web only**. Native Android Google sign-in uses
`signInWithIdToken` via the Google SDK (`@capgo/capacitor-social-login`) — a
native account picker, no browser, no Supabase URL ever shown to the user.

## Cost / prerequisite

Custom domains are a **paid Supabase add-on**, billed per project. Check
current pricing in the dashboard before planning around it.

## Order of operations

Do these in order. The old `*.supabase.co` URL keeps working after the custom
domain is live, so this can be migrated gradually rather than as a cutover —
but the Google Cloud Console step must land *before* anyone signs in against
the new domain.

### 1. Provision the domain (Supabase Dashboard)

Settings → Custom Domains → add `auth.commodity-hub.eu` (or chosen subdomain),
then add the CNAME/TXT records it gives you at the DNS provider. Wait for
Supabase to verify and provision the TLS certificate.

### 2. Google Cloud Console — BEFORE switching any client

APIs & Services → Credentials → the Web OAuth client → **Authorized redirect
URIs**: add `https://auth.commodity-hub.eu/auth/v1/callback`.

Keep the old `*.supabase.co` callback in the list until the migration is fully
done and verified — removing it early breaks sign-in for anything still
pointed at the old URL (including builds already on users' phones).

### 3. App code — one line

`.env` → `VITE_SUPABASE_URL="https://auth.commodity-hub.eu"`

Everything in `src/` derives from this (see
`src/integrations/supabase/client.ts`): REST, edge functions
(`SUPABASE_FUNCTIONS_URL`), realtime WebSockets
(`SUPABASE_FUNCTIONS_WS_URL`), and the auth health panel.

**Do not touch `SUPABASE_AUTH_STORAGE_KEY`.** It is pinned to the project ref
on purpose — it's the localStorage key holding existing sessions, and changing
it silently signs out every currently-logged-in user. A custom domain does not
change the project ref, so it stays as-is.

### 4. Things that are NOT covered by the env var

These hardcode the URL and must be updated by hand:

- [ ] **`landing/*.html`** (10 files) — `var SUPABASE_URL = '...'` in each.
      Static pages with no build step, so no shared constant to import.
- [ ] **`landing/vercel.json`** — CSP `connect-src`. Miss this and the landing
      page's API calls are blocked by the browser with no obvious error.
- [ ] **`supabase/functions/api-docs/index.ts`** — advertises the base URL in
      the published API docs.
- [ ] **Edge function integration tests** — `health-check`, `api-docs`,
      `_shared/rateLimit_test.ts`.

### 5. Things that live outside the repo entirely

Easy to forget; each one breaks silently.

- [ ] **RevenueCat webhook** — dashboard → Project → Integrations. Points at
      `.../functions/v1/revenuecat-webhook`. If stale, subscription state
      stops syncing to `profiles` and nobody notices until a user complains
      about missing premium.
- [ ] **Database cron jobs (`pg_cron` + `net.http_post`)** — these live in the
      database, not in git. At least two call edge functions by absolute URL:
      - `evaluate-price-alerts` (see `docs/PRICE_ALERTS_SETUP.md`)
      - `refresh-fundamentals-every-2h` (see `docs/FUNDAMENTALS_REFRESH_SETUP.md`)
      - `fetch-cot-report-daily` (see `docs/COT_REFRESH_SETUP.md`)
      - `refresh-commodity-news-feed-every-30min` (see `docs/NEWS_FEED_REFRESH_SETUP.md`)
      (`audit-premium-freshness` is admin-triggered on demand from
      `/admin/catalog-audit`, not on a cron schedule — listed here before but
      that was never actually true; verified 2026-08-27, see
      `cron.job` for the current source of truth either way.)
      Find them with:
      ```sql
      SELECT jobid, jobname, command FROM cron.job;
      ```
- [ ] **Any other third-party webhook** pointed at an edge function.

### 6. Verify

- [ ] Web Google sign-in — confirm the URL bar shows the custom domain
- [ ] Email/password sign-in and the OTP code flow
- [ ] Realtime commodity stream connects (WebSocket, not just REST)
- [ ] Landing page loads live prices
- [ ] A RevenueCat test purchase still updates `profiles`
- [ ] Cron jobs fire on schedule (check edge function logs the next day)

Only after all of the above: consider removing the old `*.supabase.co`
redirect URI from Google Cloud Console — and only once no shipped Android
build still references the old URL, since those can't be updated remotely.
