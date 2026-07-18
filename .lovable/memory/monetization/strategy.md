---
name: Monetization Strategy
description: Freemium — 30 free + 21 trimmed premium commodities at $19.99/mo or $149/yr
type: feature
---
**Model**: Freemium. Pricing raised on 2026-04-18 to align with API costs.

**Pricing**:
- **Monthly**: $19.99/mo (was $11.99)
- **Annual**: $149/yr (was $89, saves ~38%)
- Optional founders discount: $14.99/mo for first 100 subscribers (marketing-only, not in code)

**Free tier** (~30 commodities): unchanged — crude majors, gas, all base metals, grain futures, classic softs, lumber, base livestock.

**Premium tier** (~21 commodities, trimmed from ~55):
- **Crude (4)**: WTI Midland, Mars, LLS, Western Canadian Select
- **Refined (6)**: Gasoline RBOB, Heating Oil, Jet Fuel, ULSD, Gasoil, Naphtha
- **Marine fuels (3)**: VLSFO Global, HFO 380 Rotterdam, MGO 0.5%S Global
- **Metals (8)**: Lead Futures, Nickel Futures, Tin, Steel, HRC Steel, Titanium, Lithium, Cobalt
- **Grains (2)**: Canola, Sunflower Oil
- **Softs (2)**: UK Sugar No 5, Palm Oil

**Removed from premium catalog** (2026-04-18):
- Niche regional crude: Indian Basket, Tapis, Urals, Alaska North Slope
- Low-demand refined: Propane, Ethanol
- Marine fuel sub-grades: HFO 380 Global, VLSFO Singapore, MGO Houston, VLSFO Fujairah
- Duplicate metal spot/futures pairs (kept futures): Copper Futures, Aluminium Futures, Lead Spot, Nickel Spot, Magnesium
- Grain spot duplicates: Wheat Spot, Soybeans Spot, Oats Spot, Rough Rice Spot, Rapeseed Oil
- Niche softs: Tea, Wool
- **All livestock premium items** (8): Feeder Cattle, Cheese, Eggs CH/US, Salmon, Poultry, Butter, Potato — near-zero retail trader demand
- Industrial niche: Bitumen, Rhodium, all plastics/fertilizers/rare earths

**Source of truth**: `PREMIUM_COMMODITIES` set in `supabase/functions/_shared/commodity-mappings.ts` (mirrored as `PREMIUM_ENERGY` in `oil-price-api/index.ts`).

**Cache TTL**: 2 hours (was 1h). Halves API burn. Spot prices don't move enough hourly to justify the cost.

**Enforcement**:
- `fetch-all-commodities` reads JWT → checks `profiles.subscription_active && subscription_tier !== 'free'` → passes `includePremium` to `CommodityService.fetchAllCommodities()`.
- `oil-price-api` filters batch requests against `PREMIUM_ENERGY` unless `includePremium: true` in body.
- Cache keyed per-flag (`all-commodities:free` vs `all-commodities:premium`) — no cross-tier leakage.

**Economics rationale**: At $19.99/mo with trimmed catalog + 2h cache, per-subscriber API cost stays well below revenue. Reference: TradingView Pro $14.95, Barchart Premier $33.95.

**Stripe/RevenueCat**: Price IDs must be updated separately in the billing dashboard — code only references generic checkout.

**Frontend**: `useAuth().isPremium` is the canonical client-side check. Edge functions re-verify via JWT — never trust client claims.

**Growth plan (2026-05-24)**: See `docs/GROWTH_PLAN.md`. Pending decisions:
- Drop Premium to $6.99/mo / $49/yr; introduce Pro tier at $19.99/mo with API access.
- Reposition Premium around **price alerts + CSV export + multi-portfolio** — catalog breadth becomes a bonus, not the headline (catalog-only premium caps conversion near 1%).
- Highest-leverage build: price alerts (push notifications). Expected lift: 1% → 3–4% conversion.
- iOS launch gated on Android hitting $500 MRR or 5K MAU.
- ASO: target `commodity prices app` (KD 0), `gold price app` (KD 42), `commodity portfolio` (KD 0) in Play Store listing.

**Price alerts (shipped 2026-05-24)**: Free=1 active, Premium=50 active. Tables `price_alerts` + `price_alert_triggers` with limit-enforcing trigger. Edge function `evaluate-price-alerts` runs every 5 min via pg_cron (manual setup — see `docs/PRICE_ALERTS_SETUP.md`). In-app surface via `AlertNotificationBell` in Dashboard header + `/alerts` page. Native push (FCM) is a follow-up — current implementation is polling-based.
