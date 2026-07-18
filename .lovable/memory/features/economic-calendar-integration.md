---
name: Economic Calendar Integration
description: Economic Calendar uses FRED API (St. Louis Fed) for free, reliable US economic release schedules. No forecast field.
type: feature
---
**Source**: FRED API (Federal Reserve Economic Data) — free, unlimited, requires `FRED_API_KEY` secret.

**Edge function**: `supabase/functions/economic-calendar/index.ts`

**How it works**:
1. Curated list of ~15 US indicator series (PAYEMS, CPIAUCSL, GDPC1, PCEPI, RSAFS, HOUST, ICSA, etc.) in `TRACKED_SERIES`.
2. For each series, fetch `series/release` (resolve release_id) + last 2 `series/observations` in parallel.
3. Fetch `release/dates` per unique release_id within the date window.
4. Cross-reference: emit one event per (series × scheduled date in window) with previous/actual values.
5. Impact level + commodity tags hardcoded per series (FRED doesn't provide these).

**Limitations**:
- US only (no EU/UK/CN/JP events).
- No forecast/consensus values — FRED doesn't publish these.
- "Actual" only populated for past release dates with available observations.
- Release times are approximate Eastern times per indicator (FRED gives date only, not time).

**Replaced**: Previously used FMP `/stable/economic-calendar` which provided global events + forecast. Migrated to FRED to remove FMP dependency.
