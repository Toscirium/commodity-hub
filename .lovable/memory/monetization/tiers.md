---
name: monetization-tiers
description: Three-tier pricing — Free, Premium $6.99, Pro $19.99 — feature matrix and entitlement mapping
type: feature
---
**Three-tier freemium model** (changed 2026-05-24, prev: single $19.99 Premium):

| Feature | Free | Premium $6.99/mo | Pro $19.99/mo |
|---|---|---|---|
| Active price alerts | 1 | 10 | 50 |
| Portfolios | 1 | 3 | unlimited |
| CSV export | ❌ | ✅ | ✅ |
| Standard catalog | ✅ | ✅ | ✅ |
| Extended catalog (20 extra energy markets, regional blends) | ❌ | ❌ | ✅ |
| Priority data refresh | ❌ | ❌ | ✅ |

**Server enforcement:** DB triggers `enforce_price_alert_limit()` and `enforce_portfolio_limit()` use `public.get_user_tier(uuid)` to read tier from `profiles.subscription_tier` ('free'|'premium'|'pro').

**RevenueCat:**
- Entitlement `premium` → tier 'premium' (also granted by Pro product)
- Entitlement `pro` → tier 'pro' (wins over premium)
- Product `premium_lite_monthly` ($6.99) grants only `premium` entitlement
- Product `premium_monthly` ($19.99, legacy) grants both `premium` + `pro` entitlements
- Webhook resolves tier via `entitlements.includes('pro') ? 'pro' : 'premium'`

**Client utilities:** `src/utils/tiers.ts` (TIER_LIMITS, tierFromProfile, limitsFor). `useAuth()` exposes `tier`, `isPremium` (any paid), `isPro`. `useDelayedData().isPremium` gates extended catalog (Pro-only) — name is legacy, do not change meaning without updating all consumers.
