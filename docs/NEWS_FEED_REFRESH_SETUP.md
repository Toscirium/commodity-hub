# Scheduling the commodity news feed refresh

## Why this is needed

`refresh-commodity-news-feed` fetches EIA / OilPrice.com / USDA NASS /
Mining.com / Hellenic Shipping News RSS and upserts normalized rows into
`commodity_news_feed`, which Premium/Pro subscribers read directly (RLS-gated,
see the `commodity_news_feed` migration). Nothing calls this function from the
client — there is no lazy/on-demand path — so without a cron job the table
just never fills in.

> **Status: done.** The migration is applied, the function is deployed, and
> `refresh-commodity-news-feed-every-30min` is scheduled and active as of
> 2026-08-26. The SQL below is kept for reference — to recreate the job after
> a project restore, or to update the URL during the custom-domain migration.

## Schedule it

Run in the Supabase SQL editor. Replace `<SERVICE_ROLE_KEY>` with the
service-role key (Dashboard → Settings → API).

```sql
select cron.schedule(
  'refresh-commodity-news-feed-every-30min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/refresh-commodity-news-feed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

**Why every 30 minutes.** None of the 5 sources publish faster than that in
practice (OilPrice.com is the most frequent, at several items/hour; USDA NASS
is sporadic, sometimes days between items) — polling faster wouldn't surface
anything sooner, just adds load against free public feeds for no benefit. The
table's own `fetched_at`/`published_at` columns make actual staleness visible
regardless of the cron cadence.

## Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'refresh-commodity-news-feed-every-30min';

-- Recent runs (check status = 'succeeded')
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'refresh-commodity-news-feed-every-30min')
order by start_time desc limit 10;
```

Then confirm articles actually landed:

```sql
select source_name, count(*), max(published_at) as newest
from commodity_news_feed
group by source_name
order by source_name;
```

All 6 `source_name` values should show up with a recent `newest`. If one is
missing, invoke the function manually and read its JSON response — `sources`
reports a per-source fetch error without failing the whole run.

**Source health is worth re-checking periodically.** Two of the original five
had to be replaced after the first live run: Mining.com began returning HTTP
403 to non-browser clients, and USDA NASS's feed had gone ~11 months stale so
every row it produced fell outside the 14-day retention window and was
deleted on insert. Both failure modes are quiet — the run still reports
`ok: true`. A source showing `fetched: 0` with an error, or contributing no
rows despite fetching some, is the signal.

## Note for the custom-domain migration

This job hardcodes the project URL, and it lives in the database rather than
in git — so it will not show up in any code search. It should be listed in
`docs/SUPABASE_CUSTOM_DOMAIN.md` alongside the other `pg_cron` jobs that need
updating if the Supabase domain changes.
