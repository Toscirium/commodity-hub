# Price Alerts — Cron Setup

The `evaluate-price-alerts` edge function checks active alerts and fires triggers. It needs to run on a schedule. Schema, RLS, edge function, and UI are already deployed — only the cron job needs a one-time manual setup because it embeds project-specific credentials.

## One-time setup

### 1. Enable extensions

In the Supabase SQL editor (Database → Extensions, or run as SQL):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

### 2. Schedule the job (every 5 minutes)

Run this in the Supabase SQL editor. Replace `<SERVICE_ROLE_KEY>` with your service-role key (Supabase dashboard → Settings → API).

```sql
select cron.schedule(
  'evaluate-price-alerts-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/evaluate-price-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := jsonb_build_object('source', 'pg_cron', 'ts', now())
  ) as request_id;
  $$
);
```

### 3. Verify

```sql
-- Confirm the job is scheduled
select jobid, jobname, schedule, active from cron.job where jobname = 'evaluate-price-alerts-every-5min';

-- After ~5 minutes, check run history
select * from cron.job_run_details
  where jobid = (select jobid from cron.job where jobname = 'evaluate-price-alerts-every-5min')
  order by start_time desc limit 5;
```

Then check the edge function logs in Supabase dashboard — you should see `Evaluated N alerts, fired M`.

## How it works

- Free tier: 1 active alert. Premium: 50. Enforced by a database trigger (`enforce_price_alert_limit`).
- The evaluator reads `price_alerts` where `is_active = true`, fetches current prices via `CommodityService`, and for any alert whose condition is met:
  - Inserts a row into `price_alert_triggers` with the firing price.
  - Updates `last_triggered_at` on the alert.
- Cooldown: each alert won't re-fire for `cooldown_minutes` (default 60, min 5) after its last trigger.
- The frontend polls `price_alert_triggers` every 60s where `dismissed_at IS NULL` and surfaces them via `AlertNotificationBell` in the Dashboard header. Users dismiss triggers from the bell popover.

## Future: native push notifications

Today, notifications surface in-app via the bell badge (polling every 60s). To deliver real push:
1. Add `@capacitor/push-notifications` and request permission on first visit to `/alerts`.
2. Store FCM device tokens in a new `user_push_tokens` table.
3. Extend `evaluate-price-alerts` to call FCM (`https://fcm.googleapis.com/v1/...`) for each user with a token whose alert fired.
4. Requires a Firebase project and `google-services.json` in `android/app/`.

## Tearing down

```sql
select cron.unschedule('evaluate-price-alerts-every-5min');
```