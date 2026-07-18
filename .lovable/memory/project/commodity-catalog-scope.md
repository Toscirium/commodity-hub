---
name: Commodity Catalog Scope
description: ~58 catalog items — 17 free + ~41 premium (niche items removed 2026-05-12)
---
**Total catalog**: ~58 commodities defined in `supabase/functions/_shared/commodity-mappings.ts → COMMODITY_SYMBOLS`.

**Free tier (17, household-name only)**:
- Energy (3): WTI, Brent, Natural Gas
- Metals (4): Gold Futures, Silver Futures, Copper, Platinum
- Grains (3): Corn Futures, Wheat Futures, Soybean Futures
- Softs (4): Coffee Arabica, Sugar #11, Cotton, Cocoa
- Livestock (2): Live Cattle, Lean Hogs
- Industrials (1): Lumber Futures

**Premium-gated (~41)**:
- Energy (17): Crude Oil Dubai, DME Oman, Murban, OPEC Basket, WCS, WTI Midland, Mars, LLS, Natural Gas UK, Dutch TTF, JKM LNG, Gasoline RBOB, Heating Oil, Jet Fuel, ULSD, Gasoil, Naphtha
- Metals (11): Palladium, Aluminum, Zinc, Iron Ore, Lead Futures, Nickel Futures, Tin, Steel, HRC Steel, Titanium, Lithium
- Grains (6): Soybean Oil, Soybean Meal, Oat Futures, Rough Rice, Canola, Sunflower Oil
- Softs (3): Orange Juice, UK Sugar No 5, Palm Oil
- Livestock (1): Milk
- Industrials (3): Industrial Ethanol, Rubber, Cobalt

**Removed 2026-05-12 (niche cull)**:
- Energy: Indian Basket, Tapis, Urals, Alaska North Slope, Propane, Ethanol
- Metals: Copper Futures, Aluminium Futures, Lead Spot, Nickel Spot, Magnesium
- Grains: Wheat/Soybeans/Oats/Rough Rice Spot variants, Rapeseed Oil
- Softs: Tea, Wool
- Livestock: Feeder Cattle, Cheese, Eggs CH, Eggs US, Salmon, Poultry, Butter, Potato
- Industrials: Bitumen, Rhodium, Polyethylene, PVC, Polypropylene, Soda Ash, Neodymium, Tellurium, DAP, Urea, Gallium, Indium, Kraft Pulp, Industrial Naphtha

Rationale: near-zero retail demand, OTC-only with no clean live data, or duplicate spot/futures pairs. Reduces CPA/OilPriceAPI burn and simplifies catalog UX.

**Premium gating**: Enforced at edge function layer via `PREMIUM_COMMODITIES` set + JWT-based `isPremium` flag.

**Data sources**: Energy → OilPriceAPI exclusively. Non-energy → CommodityPriceAPI v2 Lite.

**Cache**: 2h TTL across CPA + OilPriceAPI.
