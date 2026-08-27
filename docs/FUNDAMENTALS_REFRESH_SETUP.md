# Scheduling the fundamentals refresh

## Why this is needed

`fetch-fundamentals` caches EIA / USDA / weather / rig data in
`fundamentals_snapshots` with a 6-hour TTL, refreshed **lazily** — the upstream
APIs are only called when someone requests the data and the cache is stale.

That was fine when the Fundamentals page was the only consumer: whoever opened
it paid the refresh cost and everyone after them got a warm cache.

The Copilot's `get_fundamentals` tool changes that. It reads
`fundamentals_snapshots` **directly** (calling the fetch function inline would
mean waiting on EIA/USDA upstream inside a chat turn — far too slow), so if
nobody has opened the Fundamentals page recently, Copilot answers supply/demand
questions from stale data. It surfaces `latest_period` and `updated_at` and is
instructed to date every figure, so it degrades honestly rather than silently —
but honest staleness is still staleness.

A scheduled refresh keeps the snapshot warm regardless of page traffic.

## Schedule it

**This section previously documented `Authorization: Bearer <SERVICE_ROLE_KEY>`
— that does not actually work.** `fetch-fundamentals` authenticates via
`userClient.auth.getUser()`, which rejects a service-role token (it isn't a
real user session) with `401 Invalid session`. This was never caught because
nothing had ever actually scheduled the job to find out — see
[[pg-cron-jobs-missing]]. Fixed 2026-08-27: the function now also accepts an
`x-cron-secret` header (same pattern `fetch-cot-report` and
`evaluate-price-alerts` already used), which is what the cron below uses. This
also avoids ever putting the real service-role key in a cron job's stored SQL
text, which any `cron.job` reader can see in plaintext.

First, set the shared secret once (only needed if it isn't already set —
`fetch-cot-report` uses the same one):

```
SUPABASE_ACCESS_TOKEN=<token> npx supabase secrets set CRON_SECRET=<a random value> --project-ref kcxhsmlqqyarhlmcapmj
```

Then run in the Supabase SQL editor (or via the Management API's
`/database/query` endpoint — see [[edge-function-deploy-blocked]]). Replace
`<CRON_SECRET>` with the same value:

```sql
select cron.schedule(
  'refresh-fundamentals-every-2h',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/fetch-fundamentals',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object('dataset', 'all', 'force', true)
  ) as request_id;
  $$
);
```

**Why every 2 hours rather than aligning to release times.** The headline
releases land at fixed Eastern times — EIA petroleum Wednesdays 10:30 ET, EIA
natural gas storage Thursdays 10:30 ET, Baker Hughes rigs Fridays afternoon,
USDA on its own calendar. Cron runs in UTC, so release-aligned schedules need
two entries per release to stay correct across DST, and they silently drift
when a release moves for a holiday. A flat 2-hour cadence needs no DST
arithmetic, bounds staleness at two hours for everything, and costs 12 calls a
day against free government APIs. `force: true` bypasses the 6h TTL so the
cadence is actually the cadence.

## Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'refresh-fundamentals-every-2h';

-- Recent runs (check status = 'succeeded')
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'refresh-fundamentals-every-2h')
order by start_time desc limit 10;
```

Then confirm the data actually moved:

```sql
select label, latest_period, updated_at
from fundamentals_snapshots order by updated_at desc limit 10;
```

`updated_at` should be within the last two hours. `latest_period` is the
observation date and legitimately lags — weekly series are only published once
a week, so a `latest_period` several days old with a fresh `updated_at` is
correct, not a failure.

## Note for the custom-domain migration

This job hardcodes the project URL, and it lives in the database rather than in
git — so it will not show up in any code search. It is listed in
`docs/SUPABASE_CUSTOM_DOMAIN.md` alongside the other `pg_cron` jobs that need
updating if the Supabase domain changes.
