# Setting up live vessel tracking (AISStream)

## What this is

`/vessel-tracker` (Pro tier) shows live tanker/cargo AIS positions at eight
maritime chokepoints that matter to commodity flows: Strait of Hormuz,
Bab-el-Mandeb, Suez Canal, Strait of Malacca & Singapore, Panama Canal,
Bosphorus, Strait of Gibraltar, and the US Gulf Coast.

Data comes from [AISStream.io](https://aisstream.io) over a WebSocket.
AISStream's own terms forbid connecting to it straight from a browser ("proxy
only the information your clients need from your own server") and cap an
account at 3 open connections, so the architecture is:

```
pg_cron (every 1 min)
  -> fetch-vessel-positions edge function
       -> opens ONE AISStream WebSocket, subscribes to the 8 bounding boxes,
          listens ~42s, closes
       -> upserts collected PositionReport/ShipStaticData into
          public.vessel_positions
  -> frontend reads vessel_positions + subscribes to Postgres realtime
     changes on it (no polling, no direct AISStream access from the client)
```

This mirrors the existing `fetch-cot-report` / `fetch-fundamentals`
cron-writes-a-table pattern rather than trying to hold a 24/7 socket open
inside an edge function (Supabase Edge Functions don't stay warm indefinitely,
and AISStream's connection cap makes "one socket per viewer" impossible
anyway). Positions are near-real-time (~1 minute granularity), not
millisecond-live — that's an intentional trade-off, not a bug.

## 1. Get an AISStream API key

Sign up at <https://aisstream.io/account> (free) and create an API key. It's
free for reasonable/non-commercial-scale use per their docs; re-check their
current terms before this feature drives significant traffic.

## 2. Set the secret

```
supabase secrets set AISSTREAM_API_KEY=<key> --project-ref kcxhsmlqqyarhlmcapmj
```

`fetch-vessel-positions` also reuses the existing `CRON_SECRET` (same one
`fetch-cot-report` and `fetch-fundamentals` use) for the cron auth check — no
new secret needed for that part if it's already set.

## 3. Deploy the function and push the migration

```
supabase functions deploy fetch-vessel-positions --project-ref kcxhsmlqqyarhlmcapmj
supabase db push --project-ref kcxhsmlqqyarhlmcapmj
```

(See [[edge-function-deploy-blocked]] if deploying from Claude Code directly —
both of these commands are the kind of live-prod action the sandbox
classifier sometimes blocks; run them yourself via `!` if so.)

## 4. Schedule the cron job

Run in the Supabase SQL editor (or via the Management API):

```sql
select cron.schedule(
  'fetch-vessel-positions-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/fetch-vessel-positions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

Every 1 minute is intentional, not aggressive: each run opens exactly one
AISStream connection, listens for ~42 seconds, and closes before the next
tick — comfortably under AISStream's "3 connections per account" cap with no
overlap, and it's what makes the tracker feel live at all.

## 5. Verify

```sql
select jobid, jobname, schedule, active from cron.job
where jobname = 'fetch-vessel-positions-every-1min';

select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'fetch-vessel-positions-every-1min')
order by start_time desc limit 10;

select count(*), max(updated_at) from public.vessel_positions;
```

`max(updated_at)` should be within the last couple of minutes once the job is
running. If `count(*)` stays at 0, the most likely causes are: the API key is
missing/invalid (check `return_message` / function logs), or genuinely no
tanker/cargo traffic is inside the 8 boxes at that moment (rarer, since Hormuz
and the Gulf Coast are busy almost continuously).

## Known limitations, on purpose

- **Coverage, not completeness.** AIS reception depends on terrestrial
  antennas and satellite relay; AISStream doesn't claim 100% coverage of any
  region, and neither does this feature.
- **"Unclassified" vessels are real, not a bug.** `ShipStaticData` (name,
  type) is broadcast far less often than `PositionReport` — a vessel can sit
  in the table with a position and no name/type for a while.
- **Map tiles are the free CARTO dark basemap** (`basemaps.cartocdn.com`), no
  API key needed today. If this page gets meaningful traffic, re-check
  CARTO's usage terms — a paid tile provider (Mapbox, MapTiler, Stadia Maps)
  may become necessary the same way `refresh-commodity-news-feed`'s RSS
  pipeline and the old CommodityPriceAPI Lite plan both hit real vendor
  limits once usage grew.
- **No historical playback.** `vessel_positions` is a live snapshot (one row
  per MMSI, upserted in place) with a 48h stale-row cleanup baked into
  `fetch-vessel-positions` — there's no track history to scrub back through.
  Building that would mean a separate append-only table and is a real,
  deliberate scope cut for this first version.

## Note for the custom-domain migration

Same as the other cron-triggered functions: this job hardcodes the project
URL and lives in the database, not git. Add it to
`docs/SUPABASE_CUSTOM_DOMAIN.md`'s list alongside the others.
