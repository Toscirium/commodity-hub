# Conversion Pipeline

Last updated: 2026-07-18

## Goal

Move free users from a useful first outcome to a paid workflow without hiding core market discovery.

1. **Activation:** search, pin a market, or create one alert.
2. **Habit:** return to Today, review an alert, or monitor a watchlist.
3. **High-intent upgrade:** show a plan when the user needs more alert capacity, a premium benchmark, export, or advanced analysis.
4. **Purchase:** present Premium first ($6.99/month), then Pro only where advanced workflows are relevant.
5. **Retention:** send users to their alert, portfolio, or Daily Brief immediately after purchase.

## Funnel events

The app emits these through `monitoringService`. Before relying on the metrics,
route that service to a production analytics destination (for example, a
first-party Supabase event endpoint or a configured product-analytics tool).
Until then, events remain in the client monitoring queue and are not a durable
source of truth.

| Event | Meaning | Primary breakdown |
|---|---|---|
| `upsell_impression` | A catalog upgrade card was visible | `variant`, `placement`, `is_native` |
| `upsell_cta_tapped` | User asked to see plans | `variant`, `placement`, `is_native` |
| `paywall_viewed` | Plan dialog opened | `source`, `tier`, `is_native` |
| `paywall_offering_loaded` | RevenueCat packages were available | `source`, package counts |
| `paywall_download_cta_tapped` | Web user chose the Android handoff | `source` |
| `purchase_started` | Store purchase flow opened | `paywall_source`, `tier_target`, product and price |
| `purchase_succeeded` / `purchase_cancelled` / `purchase_failed` | Store outcome | product, price, failure code where applicable |

Review these weekly as a funnel: `paywall_viewed → purchase_started → purchase_succeeded`. Segment by `source` before changing copy or prices.

## First experiments

1. **Alert-limit moment:** compare “Get 10 alerts” with “Never miss a level” after a free user creates their first alert. Success metric: purchase starts per alert-active user.
2. **Catalog moment:** compare group-specific benchmark copy with a compact “Full catalog + exports” card. Success metric: paywall opens per catalog session.
3. **Plan order:** keep Premium first for alert/export intent; show Pro first only for analytics/API intent. Success metric: purchase completion, not just CTA clicks.
4. **Annual presentation:** once RevenueCat packages are confirmed, label the annual package with the exact effective monthly price and saving. Do not claim a discount that does not match the active offering.

## Operating rules

- Keep the first alert, one portfolio, and market search free: they are activation mechanics.
- Gate additional capacity and repeatable workflows, not basic price discovery.
- Do not change pricing, entitlements, or purchase products in code without matching RevenueCat and Play Console configuration.
- Review purchase failures by product and device before running price experiments.
