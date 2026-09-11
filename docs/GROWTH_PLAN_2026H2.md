# Commodity Hub — Growth Plan (H2 2026)

Modelled on how MarketWatch, Benzinga, and Alpha Vantage actually grew.
Last updated: 2026-09-11. Companion to `MARKETING_PLAN.md`. Supersedes `GROWTH_PLAN.md` (May 2026).

> **2026-09-11: retail traders only.** All B2B sales plans are scrapped — no Enterprise API tier, no
> seat-priced Team/Business SKU, no white-label/licensing business, no pursuit of ICP D
> (physical-side/procurement/fund customers). Every remaining engine here targets individual retail
> traders (and the analysts/developers who are themselves individual subscribers, ICPs A/B/C in
> `MARKETING_PLAN.md`). See `docs/LINKEDIN_FUNNEL.md` for the same cut applied to that channel.

---

## 1. What actually drove the three comparables

Not what they look like today — what moved them.

### MarketWatch — free content as the subscription funnel

Dow Jones bought MarketWatch in January 2005 explicitly on the thesis that **free traffic is an
effective way to create subscribers**, using it as the accessible top-of-funnel into WSJ/Barron's.
The paywall only arrived in October 2020, fifteen years later. Dow Jones roughly doubled digital
subscriptions from 2.43M (Q4 2019) to 4.86M (early 2024) on that portfolio logic.

**But the model is decaying.** MarketWatch organic search traffic fell ~17% month-on-month as of June
2026. The free-content funnel still works; *pure Google dependence* no longer does.

> **Transfers:** free, genuinely useful public pages as the acquisition layer; paywall the workflow,
> never the discovery.
> **Does not transfer:** a 2005–2015 SEO land-grab. Build for AI answer engines in parallel from day
> one.

### Benzinga — the data was worth more than the audience

Benzinga started as an online newspaper monetised by ads, then noticed **the data its writers were
already aggregating was the more valuable asset**. It productised that into feeds and APIs for
brokerages: now 400+ brokerage partners, ~100M readers/month reached through partners, clients in 40+
countries, ~500% growth after retail interest exploded in 2020, and a $300M acquisition by Beringer
Capital in 2021. The end state is B2B2C — the reader is a customer of the partner, not of Benzinga.

> **Transfers:** the distribution mechanic, not the customer type. We already have both halves of the
> asset — a **free embeddable price widget** (no account, no API key) and a **Data API**. Benzinga's
> insight is that distributing your data through other people's audiences beats buying your own —
> here that means placing the widget with newsletters and trade press to reach *retail traders*, not
> signing brokerage/licensing contracts. We are not pursuing a B2B licensing business.

### Alpha Vantage — a free API tier as the entire growth engine

YC-backed, NASDAQ-licensed, and grown into one of the most widely used data sources for developers
and hobbyist traders on the strength of a **free API key (25 req/day, 5 req/min)** with a clean
upgrade path. Paid plans run **$49.99/mo (75 rpm) to $249.99/mo (1,200 rpm)**, plus custom.

> **Transfers:** the free key is the marketing. We already ship a *more generous* one (50/day).
> **The gap:** our paid API is $19.99/mo — **2.5x to 12x below the comparable** — and it is not even a
> separate SKU, it is bundled into the consumer Pro subscription.

---

## 2. Three engines, mapped to what is already built

The strategy is not "pick one of these three companies." It is that Commodity Hub already has the raw
asset for all three engines, and each one feeds the others.

```
Engine 1: Answer surface  ──┐
  (MarketWatch lesson)      │
                            ├──► Free users ──► Premium $6.99 ──► Pro $19.99
Engine 2: Embed/licensing ──┤         ▲
  (Benzinga lesson)         │         │ backlinks + brand
                            │         │
Engine 3: Developer API   ──┘─────────┘
  (Alpha Vantage lesson)
```

---

### Engine 1 — Owned answer surface

**Current state:** 9 `/now` pages, 9 `/commodities` pages, 5 glossary entries, 3 learn guides, a
market-data calendar, a roll-yield calculator, and an `llms.txt`. That is a good skeleton on a
**40+ contract catalog** — meaning roughly three-quarters of the catalog has no public page at all.

**The move:** programmatic expansion to the full catalog, on the *structure* layer where nobody else
has a page. For each commodity: live price, forward curve shape, COT positioning, seasonality
profile, and the release calendar that moves it.

Why this is the cheapest available growth: these are not thin SEO pages. Every one is backed by data
already in the database and already refreshed on cron. The marginal cost of page #40 is a template
render.

**Target the queries the big sites structurally cannot answer:**

- "is natural gas in contango" / "wti curve backwardation today"
- "corn seasonality chart" / "when does natural gas usually peak"
- "cot report copper managed money"
- "wheat roll yield" / "brent wti spread today"

Nobody at MarketWatch is writing the copper COT page. That is the opening.

**Do not skip the AI-answer surface.** With Google organic declining for finance publishers, `llms.txt`
and clean structured data are not a side quest — extend `llms.txt` to cover the full catalog and every
tool, and keep the "not a broker / data as of" framing in it that already reads well to answer engines.

**Metric:** indexed pages, then non-brand organic entries to `/now/*` and `/commodities/*`, then
signup rate from those pages.

---

### Engine 2 — Embed distribution (highest-leverage, most under-exploited)

**Current state:** a free, no-account, no-API-key embeddable price widget exists at `/embed`. Almost
nothing points at it and nobody is being asked to use it.

This is the Benzinga asset sitting idle. Each placement is simultaneously: a backlink (feeds Engine
1), a brand impression in front of a perfectly-qualified audience, and a zero-CAC acquisition channel.

**The outbound program — build a target list of ~150 and work it manually:**

- Agricultural newsletters and co-op member sites (corn, wheat, cattle, dairy)
- Mining and metals trade press; energy trade press
- Commodity Substacks and independent analyst newsletters (ICP B — they get a free tool, we get
  placement in front of their subscribers)
- University commodity-markets and agribusiness course pages
- Regional broker blogs and educational sites

**Sequencing:** widget first (free, no friction, no negotiation). Where a placement performs, offer a
co-branded chart or embed. Unlike Benzinga we are stopping there, at content distribution — no
white-label licensing or brokerage-style B2B deals; the point is reach into retail traders, not a
second revenue line sold to other businesses.

**Metric:** live embeds, referral sessions per embed, signups per referring domain.

---

### Engine 3 — Developer API

**Current state:** free tier (1 key, 50 req/day, no card) and a Pro tier at $19.99/mo with unlimited
keys, 60 rpm, and no monthly cap. Resources: prices, COT, fundamentals, portfolio/watchlist. Public
reference at `/developers`, pricing at `/data-api`.

The free tier is right and already beats Alpha Vantage's. **The pricing is the problem.**

**Pricing recommendation — split the API into its own ladder:**

| Tier | Proposed | Rationale |
|---|---|---|
| Free | 50 req/day, 1 key | Keep. It is the acquisition engine. More generous than Alpha Vantage. |
| **API Starter** | **~$29/mo** | Fills the gap between hobbyist and Pro. Does not exist today. |
| **API Pro** | **~$79–99/mo** | Alpha Vantage charges $49.99 for 75 rpm; we give unlimited keys and 60 rpm for $19.99. We are leaving most of the price on the table. |

No enterprise/custom-contract tier — the API ladder stops at a self-serve paid plan for individual
developers and quants. No sales team, no SLA negotiation, no B2B contracts.

Keep **flat-rate, no per-request billing** as the headline — it is a genuine differentiator against
the metered commodity-API incumbents and it is already the marketing line on `/developers`.

> **Blocked externally:** a separate API SKU needs product setup in RevenueCat/Stripe before it can be
> built. The `/admin/data-api-usage` dashboard exists precisely to inform this decision — do not set
> final prices until there is real traffic in it.

**Distribution (this is how Alpha Vantage won, not the docs):**

- Publish thin Python and JS client libraries to PyPI and npm. Package registries are a search surface.
- List on API marketplaces and directories.
- Write the honest comparison content: *"Commodity data APIs compared"* — we win on commodity depth
  and flat-rate pricing, we lose on equities/FX breadth. Say both. The credibility is the conversion.
- A worked example notebook ("backtest a seasonal corn trade in 30 lines") does more than a reference page.

**Metric:** free keys created → keys making ≥1 call in week 2 → paid conversion. Free-key activation
is the leading indicator; watch it before revenue.

---

## 3. Sequencing

### Phase 1 — Months 0–3: reposition and fill the surface

1. Rewrite `landing/index.html`, the Play Store listing, and the screenshot set to the analytics
   claim (see `MARKETING_PLAN.md` §7). Nothing else in this plan works while the front door says
   "price tracker."
2. Programmatically generate the remaining `/now` and `/commodities` pages to full catalog coverage;
   extend `llms.txt` to match.
3. Ship per-commodity **curve**, **COT**, and **seasonality** pages for the top ~15 contracts.
4. Build the 150-target embed list; send the first 50 outreach emails.
5. Publish the methodology/provenance page.

**Gate to Phase 2:** non-brand organic entries growing month-over-month, and ≥10 live embeds.

### Phase 2 — Months 3–6: turn distribution into signups

1. Work the remaining embed list; instrument referral attribution per domain.
2. Ship API client libraries and marketplace listings.
3. Publish the API comparison page and the worked-example notebook.
4. Run the paywall experiments already specified in `CONVERSION_PIPELINE.md` — alert-limit moment,
   catalog moment, plan order. These are written and unrun; the traffic from Phase 1 makes them
   meaningful.
5. Decide the API SKU using real `/admin/data-api-usage` data.

**Gate to Phase 3:** a repeatable channel — one of (organic, embed referral, developer) producing
signups at a stable rate.

### Phase 3 — Months 6–12: monetise depth

1. Launch the separate API pricing ladder (needs the external RevenueCat/Stripe setup first), still
   self-serve consumer pricing — no enterprise/custom tier.
2. Escalate the best-performing embeds to co-branded chart placements — the Benzinga distribution
   move, without the licensing-to-brokerages business model behind it.
3. iOS, when Apple Developer enrollment and a Mac/Xcode are in hand — currently scaffolded and
   blocked externally, not a code problem.

**Scrapped:** pursuing ICP D (physical-side/procurement) and a seat-priced "Business SKU" for Team
Workspace. Team Workspace stays as-is, bundled into Pro for retail power users (e.g. a couple of
traders sharing notes) — it is not a B2B sales target and no company/enterprise-facing tier is planned
around it.

---

## 4. Metrics that matter

Watch these, in this order. Do not optimise a downstream number while an upstream one is flat.

| Stage | Metric | Why |
|---|---|---|
| Reach | Indexed pages; non-brand organic entries; live embeds | Engine health |
| Activation | Signup → first alert / first pinned market / first API call | `CONVERSION_PIPELINE.md` already defines this |
| Habit | Week-2 return rate | The real predictor of paid conversion in finance apps |
| Revenue | `paywall_viewed → purchase_started → purchase_succeeded`, segmented by `source` | Already instrumented |
| API | Free keys → active keys → paid | Alpha Vantage's funnel |

**Prerequisite:** PostHog and session replay landed in commit `606fba0`. Confirm funnel events are
actually arriving in PostHog before running any experiment — `CONVERSION_PIPELINE.md` warns that
events previously sat in a client-side queue and were **not a durable source of truth**. Verify this
first; every experiment below is worthless without it.

---

## 5. Honest risks

- **The comparables are not a template.** MarketWatch had Dow Jones distribution, Benzinga had a
  newsroom and PE capital, Alpha Vantage had YC and a NASDAQ license. What transfers is the *shape* of
  each strategy, not the scale or the timeline.
- **SEO is a decaying channel for finance.** Engine 1 is still worth building — the pages are cheap
  and they double as the AI-answer and embed-landing surface — but do not model it as the primary
  growth curve the way a 2015 plan would.
- **Engine 2 is manual outreach.** There is no automation shortcut. It is 150 emails and follow-ups,
  and it will feel slow before it compounds.
- **Two of the highest-value moves are externally blocked** (API SKU pricing, iOS) and depend on
  Play Console / RevenueCat / Stripe / Apple work outside the codebase.
- **News coverage is structurally thin** on niche contracts (platinum, palladium, soybean meal, oats,
  rough rice, dairy sub-products) — the free RSS pipeline cannot fix this and neither can a paid news
  API. Do not build campaigns whose payoff depends on news depth in those markets.
- **Underpricing the API is a real revenue leak**, but re-pricing before there is usage data is
  guessing. Ship the ladder in Phase 3, not Phase 1.
