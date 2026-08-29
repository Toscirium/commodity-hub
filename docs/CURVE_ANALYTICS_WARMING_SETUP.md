# Scheduling the curve-analytics warmers (vol_cone, roll_scanner, term_structure)

## Why this is needed

`analytics_snapshots` (kind `vol_cone`, `roll_scanner`, `term_structure`) is now read
directly by `data-api`'s Pro-tier resources of the same names (see
`docs/LINKEDIN_FUNNEL.md`'s and `docs/MARKETING_PLAN.md`'s framing of curve
analytics as the actual product differentiator). Those `data-api` resources are
**pure cache readers by design** — they never trigger a live Massive Futures
call themselves, so a public API key can't drive cost on a paid provider just by
being polled (see the comment block above `MASSIVE_PRODUCTS` in
`supabase/functions/data-api/index.ts`).

That design is correct, but it means the cache has to be kept warm by
*something else*. Today:

- `vol_cone` has a warmer (`warm-vol-cones`) whose own file comment claims it's
  "triggered by pg_cron every 4h" — **don't trust that claim without checking**,
  per [[pg-cron-jobs-missing]]'s whole point: a comment isn't evidence a job
  exists. Verify with the query below before assuming it's live.
- `roll_scanner` and `term_structure` had **no warmer at all** until this
  change — their only refresh path was a real Pro user opening that page
  in-app. For an app user that's a real if imperfect self-healing story; for a
  developer using only the API, who may never open the app, it meant those
  two resources could 404 (`snapshot_not_available`) or serve indefinitely
  stale data forever. Fixed by adding `warm-roll-scanner` and
  `warm-term-structure` — same shape as `warm-vol-cones`, same cron secret.

None of this is required for the API to *function* — it already fails honestly
(`stale: true`, `404 snapshot_not_available`) rather than silently. It's
required for the API to be **usable as a standalone product** by someone who
never touches the app, which is exactly who these resources are marketed to.

## Schedule them

Run in the Supabase SQL editor (or via the Management API — see
[[edge-function-deploy-blocked]]). All three warmers accept `x-cron-secret`
against `ALERT_EVALUATOR_SECRET` — the same secret `evaluate-price-alerts`,
`pro-daily-digest`, and `warm-options-chain` already use (per each function's
own file comment; there's a separate, older `CRON_SECRET` used by
`fetch-cot-report`/`fetch-fundamentals` instead — two different live secrets,
a pre-existing inconsistency, not something introduced here — use
`ALERT_EVALUATOR_SECRET` for these three specifically).

```sql
-- vol_cone — only run this if the verify query below shows it's missing.
select cron.schedule(
  'warm-vol-cones-every-4h',
  '0 */4 * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/warm-vol-cones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<ALERT_EVALUATOR_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- roll_scanner
select cron.schedule(
  'warm-roll-scanner-every-4h',
  '5 */4 * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/warm-roll-scanner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<ALERT_EVALUATOR_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- term_structure
select cron.schedule(
  'warm-term-structure-every-4h',
  '10 */4 * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/warm-term-structure',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<ALERT_EVALUATOR_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

**Why 4h, and why staggered by 5 minutes.** Matches `CACHE_TTL_MS` in
`massive-vol-cone`/`massive-term-structure` and `data-api`'s
`ANALYTICS_SNAPSHOT_STALE_MS` — a snapshot refreshed every 4h is never more
than 4h old, comfortably inside the 6h staleness threshold those functions
use, even accounting for a slow run. The 0/5/10-minute offsets just avoid three
jobs hitting Massive Futures in the same instant; they don't need to be exact.

**Why 13 (or 16) sequential Massive calls every 4h is an acceptable cost.**
`warm-vol-cones` and `warm-term-structure` each make one Massive Futures call
per product (13), `warm-roll-scanner` makes one per product it covers (16) —
sequential, not parallel, deliberately gentler on the provider than the
interactive in-app functions. That's roughly (13+13+16) × 6 runs/day ≈ 250
calls/day total across all three warmers. Sanity-check this against your
actual Massive Futures plan's request quota before scheduling — it wasn't
possible to confirm your plan's limit from this codebase alone.

## Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname in ('warm-vol-cones-every-4h', 'warm-roll-scanner-every-4h', 'warm-term-structure-every-4h');

select j.jobname, r.status, r.return_message, r.start_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname in ('warm-vol-cones-every-4h', 'warm-roll-scanner-every-4h', 'warm-term-structure-every-4h')
order by r.start_time desc limit 20;

-- Confirm the snapshots are actually moving, not just that the cron fired:
select kind, key, as_of from public.analytics_snapshots
where kind in ('vol_cone', 'roll_scanner', 'term_structure')
order by kind, key;
```

If `warm-vol-cones` already appears in `cron.job` under a different job name,
don't schedule a second copy of it — just confirm it's `active` and its
`cron.job_run_details` rows show recent successes.
