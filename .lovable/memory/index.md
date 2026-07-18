# Memory: index.md
Updated: just now

# Project Memory

## Core
- **Product:** Commodity price-tracking app (Google Play Store launch). NO trading features. Read-only price data + news + analytics.
- **Monetization:** Three-tier freemium via RevenueCat (Play IAP). Free / Premium $6.99 (10 alerts, 3 portfolios, CSV) / Pro $19.99 (50 alerts, unlimited portfolios, +20 energy markets, priority refresh). See `mem://monetization/tiers`.
- **Styling:** Dark theme with dark purple and teal branding.
- **Navigation:** Hub-and-spoke pattern. Every sub-page requires a '← Dashboard' back button.
- **Data Sourcing:** Energy from OilPriceAPI. CME/CBOT/COMEX/NYMEX non-energy from Massive Futures Basic (6h cache, 5 req/min throttle). ICE/LME items (softs, canola, LME metals) from FMP free tier. FX from Frankfurter.app.
- **Security:** Strict RLS (`id = auth.uid()`). Edge functions enforce JWT auth + Zod validation.
- **Supabase:** Project ID `kcxhsmlqqyarhlmcapmj`. OAuth used for Google/GitHub.

## Memories
- [Monetization Strategy](mem://monetization/strategy) — Freemium with RevenueCat, premium unlocks specialty commodities
- [Monetization Tiers](mem://monetization/tiers) — Free/Premium/Pro feature matrix, RevenueCat entitlement mapping, DB triggers
- [Marketing Infrastructure](mem://features/marketing-infrastructure) — Phased growth strategy, landing page, blog
- [Production Readiness](mem://launch/production-readiness) — Monitoring, Supabase health checks, security config
- [News System](mem://features/news-system) — Edge function aggregation from Marketaux + News API
- [GitHub Integration](mem://auth/github-integration) — OAuth configuration for Supabase
- [Android Signing](mem://launch/android-signing) — Build instructions for signed AAB in Android Studio
- [Google Config](mem://auth/google-config) — Google Auth via Supabase OAuth
- [Play Store Listing](mem://launch/play-store-listing) — Category, Data Safety, 18+ target audience details
- [Database Hardening](mem://security/database-hardening) — RLS policies, credential encryption logic
- [Edge Function Security](mem://security/edge-function-security) — JWT, Zod validation, error response rules
- [Client-Side Storage](mem://security/client-side-storage) — API key encryption in localStorage via AES-256-GCM
- [Account Deletion](mem://features/account-deletion) — Multi-step flow purging user data for Play Store compliance
- [Branding](mem://style/branding) — Dark theme, dark purple and teal aesthetic
- [Store Assets](mem://launch/store-assets) — Google Play Store graphics locations and resolutions
- [Navigation Pattern](mem://ui/navigation-pattern) — Hub-and-spoke with back buttons
- [Multi-Currency](mem://features/multi-currency) — EUR/CNY/INR, Edge Function, local storage sync
- [Energy Data](mem://integrations/energy-data-sourcing) — Exclusively OilPriceAPI, specific units
- [Massive Config](mem://integrations/massive-config) — Massive Futures Basic for CME-side non-energy quotes/history/curves
- [FMP Config](mem://integrations/fmp-data-config) — FMP free tier scoped to 11 ICE/LME items only
- [Commodity Catalog](mem://project/commodity-catalog-scope) — Free 17 / Premium ~60 split
- [Economic Calendar](mem://features/economic-calendar-integration) — FMP integration with dashboard deep linking
- [Catalog Freshness Audit](mem://features/catalog-freshness-audit) — Admin /admin/catalog-audit page + audit-premium-freshness edge function for empirical scope decisions
