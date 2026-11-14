---
name: Yahoo Finance Futures Configuration
description: Free Yahoo Finance chart/spark endpoints price the whole catalog (quotes, history, curves); replaced Massive Futures 2026-11-14
type: integration
---
**Provider**: Yahoo Finance public endpoints (`query1`/`query2.finance.yahoo.com`), no API key, no secret.
**Client**: `supabase/functions/_shared/futures-client.ts` — `fetchFrontMonth`, `fetchFrontMonthBars`, `fetchDailyBars`, `fetchFuturesCurve`, `fetchContractDailyClose`.
**Roots**: `FUTURES_PRODUCT_CODES` in `_shared/commodity-mappings.ts` (31 items). Exchange suffix map (`NYM`/`CMX`/`CBT`/`CME`) lives in the client.

**Endpoints**:
- `/v8/finance/chart/<root>=F?range=10d&interval=1d` — continuous front month quote + prior close.
- `/v8/finance/chart/<ticker>?period1&period2&interval=1d` — daily OHLC (continuous or single contract, e.g. `CLF27.NYM`).
- `/v7/finance/spark?symbols=<≤20 tickers>&range=5d` — batch probe of contract months to build forward curves (no listing endpoint exists; stale/expired months are filtered by last-trade time).

**Tickers returned to callers** stay in plain exchange format (`CLF27`), same as the old Massive client, so stored DB rows remain comparable.

**Caveats**: unofficial/no SLA, ~10-30 min delayed, may rate-limit shared edge IPs (6h edge cache + `commodity_price_snapshots` fallback absorb this). Yahoo terms restrict commercial redistribution — revisit before scaling the paid tiers / Data API.

**Not covered here**: options chains still need Databento (`DATABENTO_API_KEY`); only the underlying front-month price comes from this client.

**Bonus coverage available but not yet in catalog**: ICE softs (KC=F, SB=F, CT=F, CC=F, OJ=F) also quote on Yahoo.
