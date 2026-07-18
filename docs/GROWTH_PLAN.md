# Commodity Hub — Growth & Revenue Plan

Last updated: 2026-05-24. Sources: Semrush (US database, May 2026), current paywall code, RevenueCat config.

---

## 1. ASO / Keyword Research

### Demand snapshot (Semrush, US)

| Keyword | Volume/mo | KD | CPC | Take |
|---|---|---|---|---|
| oil prices | 246,000 | hard | $1.72 | Massive demand. Big-site territory (Bloomberg, OilPrice.com, Reuters). Don't fight head-on. |
| oil prices today | 110,000 | hard | $1.72 | Same — page-2 at best for a new app. |
| crude oil prices | 74,000 | hard | $2.16 | High-CPC = commercially valuable. |
| wti oil price | 49,500 | hard | $0.48 | Niche-down candidate. |
| natural gas prices | 40,500 | 77 | $1.42 | Hard but reachable with consistent content. |
| commodity prices | 22,200 | 85 | $1.29 | Brand category term — chase via long-tails. |
| wti price | 12,100 | 97 | $0.41 | Too hard. |
| brent crude price | 6,600 | 98 | $1.64 | Too hard. |
| commodity news | 480 | 73 | $1.83 | Backable with our news aggregation. |
| **gold price app** | **170** | **42** | **$2.03** | **Sweet spot — winnable, intent-matched.** |
| oil price tracker | 70 | 84 | $1.65 | Low volume, but exact-match for our app. |
| **commodity prices app** | **20** | **0** | **$2.77** | **Tiny but uncontested — own this term in Play Store.** |
| commodity portfolio | 20 | 0 | — | Easy win for our portfolio feature. |

### Question keywords with real intent

- "how to track crude oil prices" / "how to track oil prices" (30/mo each)
- "what etf tracks the price of oil" (20/mo)
- "how to track the price of oil" (10/mo)

These are perfect blog/landing-page targets — low volume individually, but high commercial intent and very low difficulty.

### Recommended Play Store listing rewrite

**Current title** (likely): "Commodity Hub"

**Proposed title (30 char max):**
`Commodity Hub: Oil & Metals`

**Proposed short description (80 char max):**
`Live oil, gold, gas & metal prices. Track 46 commodities + news in one app.`

**Long description must-have keywords (in first 167 chars — what shows in search):**
`Commodity prices app for traders & procurement. Track WTI, Brent, Henry Hub natural gas, gold, silver, copper, aluminum and 40+ commodities with live prices and news.`

Then in the body: include `oil price tracker`, `gold price app`, `natural gas prices`, `commodity portfolio`, `commodity news`, `crude oil prices today`, `LNG`, `JKM`, `TTF`, `WCS`, `lithium price`, `iron ore price`.

### Marketing site landing-page topics (5)

High-intent, low-difficulty pages to build at `commodity-hub.lovable.app/blog/...`:

1. **"How to track crude oil prices in 2026 (free + paid tools)"** — targets the "how to track oil prices" cluster
2. **"Best gold price tracking app for traders"** — KD 42, winnable
3. **"WTI vs Brent: what the spread tells you"** — evergreen, links naturally to the app
4. **"Natural gas price guide: Henry Hub, TTF, NBP, JKM explained"** — multi-keyword
5. **"Commodity portfolio tracker: how to monitor 10+ commodities at once"** — drives sign-ups

---

## 2. Premium Feature Plan to Lift Conversion

### Today's paywall (from `PremiumPaywall.tsx` + `PremiumUpsellCard.tsx`)

- **Price:** $19.99/mo or $149/yr (38% annual discount)
- **Bundled:** ~25 extra benchmarks across energy, industrials, metals, grains, softs, dairy
- **Single SKU**, no tiering

**Diagnosis:**
- **$19.99/mo is too high** for a single-feature offering (just "more markets"). Industry comp: Investing.com Pro $14.99, Bloomberg Mobile free, OilPrice.com Premium $9.99.
- The value prop is **catalog breadth only** — no workflow features (alerts, exports, multi-portfolio). Catalog breadth converts ~1% of MAU.
- The annual discount is good but irrelevant if monthly is the entry point.

### Recommended re-bundle: 2 SKUs

| Feature | Free | Premium ($6.99/mo / $49/yr) | Pro ($19.99/mo / $149/yr) |
|---|---|---|---|
| Core commodity catalog (~20) | ✅ | ✅ | ✅ |
| Full 46-commodity catalog | — | ✅ | ✅ |
| Specialty energy (WCS, LLS, JKM, TTF, NBP) | — | ✅ | ✅ |
| Industrial metals (lithium, iron ore, HRC) | — | ✅ | ✅ |
| **Price alerts (push notifications)** | — | **✅ up to 5** | **Unlimited** |
| **CSV export** (portfolio + watchlist) | — | ✅ | ✅ |
| Historical data >1 year | — | ✅ (5y) | ✅ (20y) |
| **Multi-portfolio** (max 3) | 1 only | 3 | Unlimited |
| Custom watchlists | 1 | 5 | Unlimited |
| **API access** (read-only) | — | — | ✅ |
| Priority refresh | — | ✅ | ✅ |
| News digest email (daily/weekly) | — | ✅ | ✅ |

### Build backlog ranked by (conversion impact ÷ effort)

| Feature | Impact | Effort | Score | Notes |
|---|---|---|---|---|
| **Price alerts (push)** | 🟢🟢🟢 | M | **9/10** | Highest-converting feature in every finance app. Requires Capacitor push + cron edge function. |
| **Multi-portfolio** | 🟢🟢 | S | **8/10** | DB schema already supports `user_id` scoping — mostly UI work. |
| **CSV export** | 🟢🟢 | S | **8/10** | Trivial — client-side blob. Hits the "I'm paying so I can actually use this data" lever. |
| **Custom watchlists (5+)** | 🟢🟢 | S | **7/10** | Likely already exists; just gate the limit. |
| News digest email | 🟢 | M | **5/10** | Re-uses news aggregation edge function + Resend/SendGrid. |
| Historical data 5y+ | 🟢 | M | **4/10** | Depends on FMP/OilPriceAPI history availability. May require paid plan upgrade. |
| API access (Pro) | 🟢 | L | **3/10** | High-value for the 1% B2B segment. Defer to month 6. |

### Ship-first picks (2 features → 2–3x conversion)

1. **Price alerts** — single biggest lever
2. **CSV export + multi-portfolio** — bundle as the "actually useful" upgrade

Estimated conversion: **1% → 3–4%** of MAU once shipped. At 10K MAU that's ~300 paid users × $6.99 × 82% net = **~$1,720/mo** vs today's ~$575/mo at 1% × $19.99.

### Positioning recommendation

- Reposition Premium as **"the alerts + export tier"** not the "more markets tier"
- Keep the broader catalog as a bonus, not the headline
- $6.99/mo hits the impulse-buy threshold; $49/yr (-42%) anchors the value
- Pro tier ($19.99) targets the procurement/B2B niche — small audience but high LTV

---

## 3. iOS Expansion Economics

### Cost model

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/yr | Recurring |
| iOS-specific dev (paywall, deep links, native OAuth) | ~40–60 hrs | Most of this is Capacitor plumbing; RevenueCat handles IAP differences. |
| App Store assets (screenshots, preview video) | ~8 hrs | Can re-use Android assets mostly. |
| Review iteration (1–2 rejections expected) | 1–2 weeks calendar time | Finance apps get scrutinized — need clear "not investment advice" disclaimers. |
| **Total one-time:** | **~1.5–2 weeks of work + $99** | |

### Revenue model (12 months post-launch)

Assumptions:
- iOS users typically have **1.8–2.2x Android ARPU** for finance apps → use 2.0x
- iOS install volume in commodities niche typically **0.6–1.0x Android volume** (Android over-indexes for finance/trading globally)
- 15% store fee (same as Play for small publishers)

| Scenario | Android MRR (mo 12) | iOS install ratio | iOS ARPU mult | iOS MRR (mo 12) | Combined |
|---|---|---|---|---|---|
| Pessimistic | $500 | 0.6x | 1.8x | $540 | **$1,040** |
| Base | $1,500 | 0.8x | 2.0x | $2,400 | **$3,900** |
| Optimistic | $5,000 | 1.0x | 2.2x | $11,000 | **$16,000** |

### Payback period

At a freelance equivalent rate of $50/hr × 50 hrs = $2,500 one-time investment:

- **Pessimistic:** $540 iOS MRR → payback in **~5 months**
- **Base:** $2,400 iOS MRR → payback in **~1.5 months**
- **Optimistic:** payback in **<3 weeks**

iOS pays back fast in all scenarios because the marginal cost is small (Capacitor reuse) and iOS ARPU is structurally higher.

### Go / no-go recommendation

**Don't launch iOS at the same time as Android.** Reasons:
1. Splits QA bandwidth at the most fragile moment.
2. Apple review can stall the launch narrative.
3. You'll learn what to fix from Android users first.

**Trigger threshold:** Launch iOS once **Android hits $500 MRR or 5,000 MAU**, whichever comes first. That signals product-market fit and justifies the 2-week investment.

**Don't launch iOS if:** Android MRR is still <$200 after 6 months. That's a product/positioning problem, not a platform problem — iOS won't fix it.

---

## Summary: realistic 12-month outlook

| Path | Year 1 net revenue |
|---|---|
| Status quo (Android only, current paywall, no ASO push) | **$500 – $5,000** |
| Android + new paywall (Premium $6.99 + alerts + export) | **$3,000 – $25,000** |
| Android + new paywall + iOS at month 6 | **$8,000 – $60,000** |
| All of the above + IBKR/BloFin affiliate revenue kicks in | **$15,000 – $100,000+** |

The single highest-leverage action is **reworking the paywall** (Section 2). ASO (Section 1) compounds slowly. iOS (Section 3) doubles the ceiling once the Android model is proven.

## Next actions

1. **This week:** Update Play Store listing title + short description per Section 1.
2. **Next 2 weeks:** Ship price alerts (push notifications) — single biggest conversion lever.
3. **Week 3:** Drop monthly price to $6.99, introduce annual at $49, keep $19.99 Pro tier with API access teased as "coming soon".
4. **Month 2:** Ship CSV export + multi-portfolio.
5. **Month 3:** Publish first 2 blog posts (gold price app, how to track crude oil prices).
6. **Month 6 (gated on $500 MRR):** Begin iOS port.