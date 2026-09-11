# Commodity Hub — Marketing Plan

**Positioning: the Commodity Analytics Platform.**

Last updated: 2026-08-29. Supersedes the positioning sections of `GROWTH_PLAN.md` (May 2026), which
described a catalog-breadth product that no longer matches what shipped.

---

## 1. The category claim

> **Commodity Hub is the analytics platform for commodities.**
> Everyone else is an equities platform with a commodities tab.

This is the whole argument, and it is defensible because of a structural difference in the asset class:

| | Equities platform's core object | Commodity Hub's core object |
|---|---|---|
| Unit | A ticker | A **curve** |
| Time | Earnings quarters | **Roll schedule + expiry** |
| Supply | Share count | **Storage, harvest, seasonality** |
| Positioning | 13F, quarterly, stale | **CFTC COT, weekly** |
| Fundamentals | Company filings | **EIA / USDA / FRED series** |

MarketWatch, Benzinga, and Alpha Vantage all model the left column extremely well and then bolt
commodities on as *a spot price on a page*. None of them will build the right column, because for
their core audience it is a rounding error. For us it is the entire product.

**The one-line test:** ask a generic finance platform "is natural gas in contango, and what has
managed money done with its position over the last eight weeks?" — none of them can answer. We answer
it on a page that already exists.

### What we are not (say this plainly, everywhere)

- Not a broker. No execution, no custody, no funds held.
- Not investment advice.
- Not a real-time institutional feed at the free tier (15-min delay; Premium/Pro remove it).

Being explicit here is a *marketing asset*, not a legal chore — it is what separates us from the
signal-selling noise in this niche, and it is what app-store and ad reviewers look for in finance.

---

## 2. The four product layers (what we actually sell)

This is the message architecture. Each layer is a reason to believe the category claim, and all of it
is already shipped.

1. **Price layer** — 40+ contracts across energy, metals, grains, softs, livestock, dairy, sourced
   from CME / CBOT / COMEX / NYMEX.
2. **Structure layer** — forward curves, term structure, contango/backwardation, roll yield, spread
   calculator and spread monitor, roll scanner. *This layer is the moat.* Generic platforms have
   nothing here.
3. **Positioning & fundamentals layer** — CFTC Commitment of Traders, EIA / USDA / FRED series,
   market-data calendar (COT, EIA petroleum, EIA gas storage, WASDE, OPEC+).
4. **Decision layer** — seasonality, volatility cone, regime scanner, market screener, correlation,
   backtest, stress test, position/risk calculator, portfolio analytics, price alerts, Daily Brief,
   AI copilot.

**Headline hierarchy:**

- H1 (category): *The analytics platform for commodities.*
- H2 (proof): *Forward curves, CFTC positioning, seasonality, and roll economics for 40+ contracts —
  in one place, from $6.99/mo.*
- H3 (differentiator): *Built for the curve, not the ticker.*

---

## 3. Ideal customer profiles

**Retail traders only — no B2B sales motion.** Every ICP below is an individual buying a personal
subscription; none is a company, desk, or procurement function being sold a contract, seat licence, or
enterprise deal.

Ranked by how well the shipped product already serves them.

| # | ICP | Tier | The job they hire us for | Where they are |
|---|---|---|---|---|
| **A** | Active retail futures / CFD trader | Premium $6.99 | "Alert me on a level; show me curve shape, COT, and seasonality before I size a trade." | Reddit (r/FuturesTrading, r/commodities), YouTube trading channels, broker communities, Play Store search |
| **B** | Independent analyst, newsletter writer, research boutique | Pro $19.99 | "Export the data, screen the universe, backtest the idea, put a chart in my note." | Substack, X/LinkedIn commodity commentators, trade press |
| **C** | Developer / quant hobbyist | Data API | "REST access to prices, COT, and fundamentals without per-request billing." | GitHub, dev marketplaces, "Alpha Vantage alternative" searches |

**A is where the volume is.** B and C are multipliers — every analyst who uses us is a distribution
channel (see Engine 2 in the growth plan), and every developer with a free key is a funnel into A's
paid tiers, not a business account to chase separately.

---

## 4. Messaging by ICP

**A — Trader**
> *Know the curve before you take the trade.*
> Contango or backwardation, at a glance. Where managed money is positioned. What this contract
> normally does in September. Alerts that fire on your level, not the market's.

**B — Analyst**
> *Your commodity research stack, minus five browser tabs.*
> Screen 40+ contracts, pull the COT series, check the seasonal, export to CSV, drop a live price
> widget in your newsletter for free.

**C — Developer**
> *Commodity data without per-request billing.*
> Prices, CFTC positioning, and EIA/USDA/FRED fundamentals over one REST API. Free key, no card.
> Flat-rate paid tier — you will never get a surprise invoice for a backfill.

---

## 5. Proof points to lead with

Use these instead of adjectives. Each is verifiable today.

- 40+ contracts across six commodity groups, with exchange and contract specs shown per market.
- Data provenance is displayed in-product (`MarketDataProvenance`) — we show where a number came from
  and when it updated.
- CFTC COT history back to 2019, refreshed on the CFTC's own weekly schedule.
- Free API tier: 1 key, 50 requests/day, no card. **Alpha Vantage's free tier is 25/day.**
- Flat-rate API pricing — no per-request billing at any tier.
- Free embeddable price widget: two lines of HTML, no account, no API key.
- Published release calendar for the reports that actually move these markets.

---

## 6. Channel priorities

Ordered by cost-to-reach for this specific niche. Detail and sequencing live in the growth plan.

1. **Owned answer surface** — programmatic per-commodity pages (price / curve / COT / seasonality),
   glossary, learn, calendar, and `llms.txt` for AI answer engines.
2. **Embed distribution** — the free widget placed in newsletters, trade press, and course material.
3. **Developer surface** — API reference, client libraries, marketplace listings, comparison content.
4. **App store (ASO)** — Play Store now; iOS when Apple enrollment is done.
5. **Community** — genuine participation in commodity-specific communities, not link-drops.
6. **Paid** — last. Only after a channel above proves a converting audience worth amplifying.

---

## 7. Launch assets needed

Concrete, and mostly copy work against features that already exist:

- [ ] Rewrite `landing/index.html` H1/H2 to the category claim (currently leads with "Live Oil, Gold &
      Metals Prices" — a price-tracker claim, which under-sells the analytics layer and puts us in a
      fight with OilPrice.com and Bloomberg we cannot win).
- [ ] A `/why-commodity-hub` page carrying the "curve, not ticker" argument and the four layers.
- [ ] Per-ICP entry pages (trader / analyst / developer) — same product, three doors.
- [ ] Rewrite the Play Store listing to the analytics claim; the current keyword set targets price
      tracking only.
- [ ] Screenshot set that leads with a **forward curve and a COT chart**, not a price list. The
      screenshots are the positioning for 90% of store visitors.
- [ ] A public methodology page: sources, refresh cadence, and known limitations. This is trust
      infrastructure for ICPs B and C, and it is the page competitors will not write.
