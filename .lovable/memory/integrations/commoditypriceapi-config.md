---
name: CommodityPriceAPI Configuration
description: Non-energy commodity quotes via CommodityPriceAPI v2 (10K/month tier); FX via Frankfurter; FMP fully removed
type: integration
---
**Provider**: CommodityPriceAPI v2 (https://api.commoditypriceapi.com/v2)
**Auth**: `x-api-key` header. Secret: `COMMODITYPRICE_API_KEY`.
**Plan**: Upgraded tier — **10,000 calls/month**, 5 symbols/request.

**What CPA serves**: All non-energy commodities (25 items) — metals, grains, softs, lumber.
**What OilPriceAPI serves**: All energy commodities (26 items) — crude, gas, refined, marine fuels.
**FX**: `currency-rates` edge fn → Frankfurter.app (free, ECB-sourced, no key).

**CPA symbol map** (`supabase/functions/_shared/commodity-mappings.ts → COMMODITY_PRICE_API_SYMBOLS`):
XAU, XAG, PL, PA, HG-SPOT, AL-SPOT, ZINC, CORN, ZW-SPOT, SOYBEAN-FUT, ZL, ZM, OAT-SPOT, RR-FUT, CA, LS, CT, CC, OJ, LB-FUT.
**Cents-quoted (÷100)**: CORN, SOYBEAN-FUT, ZL.

**Quota strategy**: All edge functions cache CPA results for **1 hour** (per-instance Map in `commodity-service.ts` and `api-clients.ts`). Estimated burn:
- Quotes: 25 sym ÷ 5/req × 24 refresh/day × 30 ≈ 3.6K/month
- Charts: ~46 commodities × 1 timeframe/day × 30 ≈ ~1.4K/month worst case
- **Total**: ~5K/month → ~50% headroom under 10K cap.

If usage approaches limit, increase `CACHE_TTL_MS` in `_shared/commodity-service.ts` from 1h → 2h.

**Removed commodities** (no provider equivalent): Feeder Cattle Futures, Lean Hogs Futures, Milk Class III. Catalog dropped 49→46.

**Disabled**: `realtime-commodity-stream` returns 410 Gone (5s WebSocket polling would burn quota in <7 min). Frontend should poll cached `/fetch-all-commodities` (1h cache).

**Reused**: `direct-exchange-feeds` reads from cached `/fetch-all-commodities` snapshot — no per-commodity API calls.

**Charts**: `fetch-commodity-data` uses OilPriceAPI for energy history, CPA `/rates/time-series` for non-energy, Alpha Vantage as last resort.

**Fully removed**: `FMP_API_KEY` references in code (the secret still exists but is unused).
