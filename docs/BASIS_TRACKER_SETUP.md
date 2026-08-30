# Deploying the Basis Tracker

## Why this is needed

`BasisTracker.tsx` is built and merged, but the table it reads and writes —
`public.basis_entries` — only exists as a migration file
(`supabase/migrations/20260830090000_basis_entries.sql`) until someone runs
`db push` against the live project. Until that happens, every read/write in
the page will fail with a Postgres "relation does not exist" error. This is
the same category of gap as the earlier data-api migrations — see
[[edge-function-deploy-blocked]]: schema changes against the live project are
reliably blocked by this sandbox's classifier, so this has to be run by hand.

## Run it

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push --project-ref kcxhsmlqqyarhlmcapmj
```

Get a personal access token from
https://supabase.com/dashboard/account/tokens if one isn't already exported —
see [[edge-function-deploy-blocked]] for the full mechanism.

**Worth a `migration list` sanity check first**, not just a blind push — this
project has a documented history of migrations sitting committed on `main`
for days without actually being pushed (see the 2026-08-19/20 update in
[[edge-function-deploy-blocked]]). Confirm `20260830090000_basis_entries.sql`
isn't already applied before assuming it needs this step, and confirm nothing
else is queued behind it that you didn't expect:

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase migration list --project-ref kcxhsmlqqyarhlmcapmj
```

## What it deploys

- `basis_entries` table — one row per saved cash-vs-futures reading:
  commodity, location, optional contract-month label, cash price, the live
  futures price snapshotted at entry time, and the computed basis.
- RLS: owner-only (`user_id = auth.uid()`), matching `user_spreads`'
  `_deny_anon` / `_select_own` / `_insert_own` / `_update_own` / `_delete_own`
  policy naming exactly.
- A `BEFORE INSERT OR UPDATE` trigger (`enforce_basis_entries_pro`) hard-gating
  writes to Pro tier via `get_user_tier()` — same enforcement shape as
  `enforce_user_spreads_pro`. The page's own UI already hides the entry form
  behind a paywall for non-Pro users; this trigger is the backend guarantee
  behind that, not the primary gate.

No new secrets, no new edge function, no new cron — this is schema only.

## Regenerating the real Supabase types (do this after the push)

`src/integrations/supabase/types.ts` currently has a **hand-written**
`basis_entries` entry — added because the generated types file can't know
about a table that isn't live yet, and the page needed to type-check before
the migration could be applied. It was written to match the migration
column-for-column (including nullability and which fields have DB defaults,
so `Insert` marks the right fields optional).

Once the migration is live, regenerate for real rather than trusting the
hand-written version indefinitely:

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase gen types typescript --project-id kcxhsmlqqyarhlmcapmj > src/integrations/supabase/types.ts
```

Diff the result against what's there now — it should be a no-op for
`basis_entries` if the hand-written version was correct, and will tell you
immediately if it wasn't.

## Verify

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'basis_entries'
order by ordinal_position;

select tgname, tgenabled from pg_trigger
where tgrelid = 'public.basis_entries'::regclass;
```

Then a real end-to-end check: sign in as a Pro-tier account, open
`/basis-tracker`, save an entry, confirm it appears in the table and the
chart. Try it once on a non-Pro account too — the insert should be blocked by
the UI (paywall) and, if bypassed, by the trigger (`check_violation`).
