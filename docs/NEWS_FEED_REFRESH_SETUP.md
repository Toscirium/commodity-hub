# Scheduling the commodity news feed refresh

## Why this is needed

`refresh-commodity-news-feed` fetches EIA / OilPrice.com / USDA NASS /
Mining.com / Hellenic Shipping News RSS and upserts normalized rows into
`commodity_news_feed`, which Premium/Pro subscribers read directly (RLS-gated,
see the `commodity_news_feed` migration). Nothing calls this function from the
client — there is no lazy/on-demand path — so without a cron job the table
just never fills in.

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

Then confirm articles actually landed, and spot-check the two sources that
couldn't be verified live before shipping (Mining.com, Hellenic Shipping
News — both blocked by bot-protection from an automated fetch during
development; high confidence on their RSS URLs, not yet proven):

```sql
select source_name, count(*), max(published_at) as newest
from commodity_news_feed
group by source_name
order by source_name;
```

Every one of the 5 `source_name` values should show up with a recent
`newest`. If Mining.com or Hellenic Shipping News is missing, check that
run's `return_message` above, or invoke the function manually and read its
JSON response — `sources` in the response body reports a fetch error per
source without failing the whole run.

## Note for the custom-domain migration

This job hardcodes the project URL, and it lives in the database rather than
in git — so it will not show up in any code search. It should be listed in
`docs/SUPABASE_CUSTOM_DOMAIN.md` alongside the other `pg_cron` jobs that need
updating if the Supabase domain changes.
