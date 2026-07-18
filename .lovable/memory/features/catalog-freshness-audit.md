---
name: Catalog Freshness Audit
description: Admin-only edge function + /admin/catalog-audit page that snapshots upstream API freshness for every premium symbol
type: feature
---
**Purpose**: Empirical "scope vs quality" decision tool. Samples last-tick age for every symbol in `PREMIUM_COMMODITIES` and classifies into live (<4h) / eod (4-24h) / stale (24h-7d) / dead (>7d).

**Components**:
- Edge function `audit-premium-freshness` (admin-only via `user_roles` table). Authorizes via service_role key (cron) OR user JWT with admin role. Snapshots into `system_metrics(metric_name='premium_freshness', metadata)`.
- Page `/admin/catalog-audit` — admin-gated, shows latest snapshot, sortable table, CSV export, on-demand "Run audit now" button.
- `CommoditySymbol.dataFreshness` field ('live'|'eod'|'reference') drives a small LIVE/EOD/REF badge on `CommodityCard`. Default 'live'.

**Decision rule applied to results**:
| Age | Action |
|---|---|
| <4h | Keep — live |
| 4-24h | Keep, mark EOD |
| 24h-7d | Demote to reference badge |
| >7d / dead | Cut from `PREMIUM_COMMODITIES` |

**Admin role bootstrap**: Run `INSERT INTO public.user_roles (user_id, role) VALUES ('<your-uuid>', 'admin');` in Supabase SQL editor.

**Cron**: Schedule daily via pg_cron + pg_net (extensions need enabling). Sample SQL:
```sql
SELECT cron.schedule(
  'audit-premium-freshness-daily',
  '0 6 * * *',
  $$ SELECT net.http_post(
    url:='https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/audit-premium-freshness',
    headers:=jsonb_build_object('Authorization', 'Bearer ' || '<SERVICE_ROLE_KEY>', 'Content-Type', 'application/json'),
    body:='{}'::jsonb
  ); $$
);
```

**Cost**: ~9 CPA calls (5 symbols/batch, throttled 6.5s) + ~17 OilPriceAPI calls per run. Negligible vs the 2h-cache user traffic.
