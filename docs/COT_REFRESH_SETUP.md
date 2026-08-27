# Scheduling the COT report refresh

## Why this is needed

`fetch-cot-report` pulls the CFTC Disaggregated Futures-Only weekly report and
caches it into `public.cot_reports` (idempotent via `UNIQUE(commodity,
report_date)`). Its own file comment says it's "designed to run on a cron
schedule every Friday evening" — but as of 2026-08-27, nothing had ever
scheduled it. The latest stored report was `2026-08-11`, over two weeks stale,
and this data is now sold externally via `data-api`'s `resource=cot` (see
`docs/../src/pages/DeveloperDocs.tsx`), so stale COT data isn't just an
internal quality issue — it's a defect in a paid product. Found and fixed the
same session as [[pg-cron-jobs-missing]] (same root cause: cron jobs live in
the database, not git, so nothing in the repo revealed the absence).

## Schedule it

Run in the Supabase SQL editor (or via the Management API — see
[[edge-function-deploy-blocked]]). `fetch-cot-report` already supports
`x-cron-secret` (same `CRON_SECRET` as `fetch-fundamentals`, see
`docs/FUNDAMENTALS_REFRESH_SETUP.md` if it isn't set yet):

```sql
select cron.schedule(
  'fetch-cot-report-daily',
  '0 15 * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/fetch-cot-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

**Why daily rather than "Friday evening."** CFTC publishes the report every
Friday around 3:30pm ET, reflecting positions as of the prior Tuesday — but
cron runs in UTC, and a single Friday-evening slot needs DST-aware arithmetic
to stay correct and silently drifts when a release is delayed (holiday weeks).
Same reasoning as `refresh-fundamentals-every-2h`'s doc: a flat cadence avoids
that entirely. The fetch pulls the last 60 weeks and upserts idempotently, so
running daily is self-healing — if Friday's run is early/missed, the next
day's run picks it up — and costs one call/day against a free public CFTC
endpoint.

## Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'fetch-cot-report-daily';

select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'fetch-cot-report-daily')
order by start_time desc limit 10;
```

Then confirm the data actually moved:

```sql
select max(report_date), count(*) from public.cot_reports;
```

`max(report_date)` should be within the last ~2 weeks (CFTC's own publish
lag) — if it's older than that, the job isn't running or CFTC's endpoint
changed shape.

## Note for the custom-domain migration

Same as `refresh-fundamentals-every-2h`: this job hardcodes the project URL
and lives in the database, not git. Listed in `docs/SUPABASE_CUSTOM_DOMAIN.md`
alongside the others.
