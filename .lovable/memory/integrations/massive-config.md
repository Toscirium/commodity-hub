---
name: Massive Futures Starter Configuration
description: Massive Futures Starter for CME/CBOT/COMEX/NYMEX non-energy quotes + history + forward curves
type: integration
---
**Provider**: Massive Futures Starter (https://api.massive.com)
**Auth**: `Authorization: Bearer ${MASSIVE_API_KEY}`
**Plan**: Starter — unlimited calls, 15-min delayed, 5y history, /snapshot enabled. CME/CBOT/COMEX/NYMEX only (no ICE/LME).

**What Massive serves**: 15 non-energy commodities — Gold, Silver, Copper, Platinum, Palladium, Corn, Wheat, Soybeans (+ Oil/Meal/Oats/Rice), Live Cattle, Lean Hogs, Lumber. Front-month snapshot, daily aggs, and forward curves.

**Product code map**: `MASSIVE_PRODUCT_CODES` in `supabase/functions/_shared/commodity-mappings.ts`.

**Endpoints**:
- `/futures/v1/snapshot?product_code=X&sort=ticker.asc&limit=N` — contract strip snapshot (Starter only). Primary path; derive expiry from `details.settlement_date` or ticker month code because snapshot rows do not always include `last_trade_date`.
- `/futures/v1/aggs/{ticker}` — daily OHLC bars (`resolution=1session`, `window_start.gte/.lte`).
- `/futures/v1/contracts?product_code=X&active=true&date=Y` — forward curve discovery + snapshot fallback walkback.

**Rate-limit strategy**: Starter is unlimited, so `fetchAllFromMassive` runs all targets in parallel (cold path ~1-2s for 15 items). 6h shared cache in `commodity-service.ts` keeps steady-state cost flat.

**Fallback**: If `/snapshot` returns empty for a product, `fetchMassiveFrontMonth` walks back up to 5 days via `/contracts` + `/aggs`.

**Helpers** (`supabase/functions/_shared/massive-client.ts`):
- `fetchMassiveFrontMonth(productCode)` → `{ ticker, price, change, changePercent, asOf }`
- `fetchMassiveFrontMonthBars(productCode, from, to)` → daily bars
- `fetchMassiveCurve(productCode, monthsAhead)` → forward curve

**ICE/LME items** (Coffee, Sugar, Cotton, Cocoa, OJ, Canola, Aluminum, Zinc, Lead, Nickel, Tin) stay on FMP free tier — see `mem://integrations/fmp-data-config`.
