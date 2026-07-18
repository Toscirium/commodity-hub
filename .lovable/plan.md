# Roadmap: Rivaling Bloomberg Terminal for Commodities

You're already ahead of most retail commodity tools. This is the gap between "great retail platform" and "the Bloomberg of commodities" — organized by cluster. Nothing here requires new paid data feeds beyond what's plausible on a bootstrapped budget (NOAA weather, EIA/USDA public data, extended FMP tier, CME options). Pick a cluster and I'll turn it into an implementation plan.

## Cluster A — Physical Market Intelligence (highest differentiation)

Bloomberg's moat isn't the futures data — it's everything **around** the contract: physical flows, inventories, weather. This is what commodity traders actually pay for.

- ✅ **EIA Weekly Petroleum Status** — crude/gasoline/distillate inventories, refinery utilization, imports/exports.
- ✅ **EIA Weekly Natural Gas Storage** — Thursday 10:30 ET print, drives NG volatility.
- ✅ **USDA Crop Progress + Condition** — corn/soy planted, corn/soy/winter-wheat good-excellent. Weekly.
- ✅ **USDA Cattle-on-Feed + Cold Storage** — monthly cattle-on-feed plus beef/pork cold storage stocks.
- ✅ **Weather layer** — HDD (NYC, Chicago), CDD (Houston, Phoenix), GDD (Des Moines), precipitation (Corn Belt, Wheat Belt). Open-Meteo, weekly aggregate.
- ✅ **Baker Hughes rig count** — U.S. + Canada rotary rigs, weekly scrape.
- ✅ **CFTC COT extreme screener** — managed-money percentile, extreme flags, commercial divergence.
- ⏳ **USDA WASDE monthly S/D** — NASS Quick Stats doesn't carry WASDE PDFs; needs a dedicated parser off usda.gov/oce/commodity/wasde. Queued.
- ⏳ **AIS ship tracking (stretch)** — tanker/LNG cargo flows via aisstream.io. Requires free API key + persistent WebSocket worker; queued.

## Cluster B — Options & Derivatives (largest missing surface)

Options on futures is a huge chunk of what Terminal users touch. Sourced from CME's public settlement JSON (EOD, ~1-day lag) — Massive Futures does **not** cover options on futures.

- ✅ **Options chain viewer** — CL/NG/GC/ZC/ZS puts/calls per expiry, IV solved from settlement price.
- ✅ **Greeks calculator** — Black-76 delta/gamma/theta/vega/rho per strike, computed client-side.
- ✅ **Put/call ratio** — OI-weighted sentiment gauge per commodity.
- ✅ **VIX-analog for commodities** — ATM IV extracted from front-expiry chain (CL/GC ≈ OVX/GVZ proxy).
- ⏳ **Vol surface / smile** — 3D IV × strike × expiry plot. Needs per-expiry aggregation across the chain fetcher.
- **Options strategy builder** — spreads, straddles, condors with P&L diagrams.

## Cluster C — Workflow & Power-User UX (Bloomberg's real advantage)

Bloomberg wins because power users hit `<GO>` and get anywhere in 2 keystrokes with 8 panels open.

- **Command palette** — `Cmd-K` opens a Bloomberg-style command bar: type "CL seasonality", "GC vs SI", "portfolio VaR" and jump directly. Fuzzy match across commodities, tools, and saved views.
- **Custom multi-panel workspaces** — user-draggable tile grid, saveable layouts ("Energy Trader", "Ag Analyst", "Macro Overlay"). Detach panels to second monitor.
- **Chart drawing tools** — Fibonacci, trendlines, horizontal support/resistance, annotations. Save per user.
- **Multi-chart compare view** — overlay 4+ commodities normalized, or split-pane synced crosshair.
- **Hotkeys everywhere** — `/` search, `[` `]` cycle commodities, `1-9` switch categories.
- **Detachable side-by-side** — open two tools in split panes (chart + spread monitor).

## Cluster D — Data Export & Integrations (Pro moat)

Institutional users need to get data **out**. This is where Pro tier really earns its price.

- **Read-only REST API** — every commodity, historical bar, cached analytics behind a personal API key. Rate-limited per tier.
- **Excel/Google Sheets add-in** — `=COMMODITY("CL", "last")`, `=SEASONALITY("ZC", "March")`. Pulls from your API. This alone justifies Pro.
- **Webhook alerts** — send alert triggers to Slack/Discord/Zapier.
- **Scheduled email/PDF reports** — daily brief already exists; add custom reports (my portfolio, my watchlist, my spreads).
- **CSV export everywhere** — extend beyond Pro analytics to any table.

## Cluster E — News & Signal Intelligence

We aggregate news; Bloomberg **enriches** it.

- **Entity/commodity tagging** — LLM-tag every headline with affected commodities, direction, magnitude.
- **Event impact score** — historical price response to similar headlines (OPEC cut → CL +2.3% avg 24h).
- **News-driven backtest** — "what happens to XY when headline Z hits?".
- **Real-time news filter** — subscribe to keyword streams per commodity (already have; extend to entity + sentiment filters).
- **Central bank / geopolitical calendar overlay** — FOMC, ECB, OPEC meetings marked on every chart.

## Cluster F — Institutional-Grade Analytics

Fill the last gaps that a serious trading desk expects.

- **VaR & stress testing** — parametric + historical VaR on portfolios (partial in Portfolio Analytics; expand).
- **Scenario builder** — "if oil drops 20% and gold rises 10%, what happens to my book?".
- **Physical/financial fair value** — storage arb calculator (spot + carry vs futures), refinery margin optimizer, crush margin economics.
- **Custom forward curves** — user builds and saves interpolated curves (linear, cubic spline, NS model).
- **Basis tracker** — cash market vs futures per delivery hub (Cushing WTI, LLS, Midland; regional grain elevators).
- **Correlation-adjusted portfolio construction** — Markowitz optimizer for commodity-only portfolios.

## Sequencing recommendation

**First quarter of effort (biggest lift, lowest risk):**
1. Command palette (Cluster C) — instant power-user credibility, 2-3 days work.
2. EIA + USDA + NOAA weather layer (Cluster A) — genuine differentiator, all free APIs.
3. Options chain viewer + Greeks (Cluster B) — largest missing feature surface.

**Second quarter:**
4. REST API + Sheets add-in (Cluster D) — Pro tier moat, converts pros.
5. Custom multi-panel workspaces (Cluster C) — Bloomberg-like feel.
6. News entity tagging + event impact (Cluster E) — LLM-native, we have the AI gateway.

**Later:**
7. Basis + physical fair-value (Cluster F).
8. Ship tracking & rig counts (Cluster A stretch).
9. Options strategy builder + vol surface (Cluster B expansion).

## What NOT to build

- **Trade execution beyond BloFin/IBKR** — regulatory lift is enormous, TSP model is right.
- **Fixed income / equities / FX at parity with commodities** — dilutes positioning. Cross-asset overlays for correlation, yes; core coverage, no.
- **Bloomberg IB chat** — community sentiment already scratches this itch; a trader chatroom needs moderation liability we don't want.
- **Ads or free-forever unlimited tier** — kills the Pro conversion story.

---

**Which cluster do you want me to plan out in detail?** A (Physical Intelligence), B (Options), C (Workflow), D (Export/API), E (News AI), or F (Institutional Analytics). Or "all of A" / "top 3 from sequencing" if you want the whole first-quarter roadmap turned into concrete implementation steps.
