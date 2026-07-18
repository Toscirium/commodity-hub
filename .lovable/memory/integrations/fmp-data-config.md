---
name: FMP Free Tier Configuration
description: FMP free tier serves only the 11 ICE/LME-listed commodities Massive can't quote
type: integration
---
**Provider**: Financial Modeling Prep free tier
**Auth**: `FMP_API_KEY` query param.
**Plan**: Free — 250 req/day.

**What FMP serves** (11 items, ICE/LME only — Massive doesn't cover these exchanges):
- Softs (ICE): Coffee Arabica (KC=F), Sugar #11 (SB=F), Cotton (CT=F), Cocoa (CC=F), Orange Juice (OJ=F)
- Grains (ICE): Canola (RS=F)
- Metals (LME): Aluminum (ALI=F), Zinc (ZNC=F), Lead (PBF=F), Nickel (NIF=F), Tin (SN=X)

**Endpoints used**:
- `/v3/quote/{symbols}` — batched front-month quote (one call covers all 11).
- `/v3/historical-price-full/{symbol}` — daily OHLC bars for charts.

**Quota math**: 1 batched quote per refresh + ~11 chart calls/day = ~12 req/day. Well under 250/day cap.

**Code paths**:
- Symbol map: `FMP_SYMBOLS` in `supabase/functions/_shared/commodity-mappings.ts`.
- Client: `supabase/functions/_shared/fmp-client.ts` (`fetchFmpQuotes`, `fetchFmpHistorical`).
- Curve helper (`fetchFmpFuturesCurve`) is dead code — forward curve moved to Massive.
