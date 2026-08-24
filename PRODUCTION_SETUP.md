# Production Environment Setup Guide

## Android Package ID

The native Android `applicationId` and Capacitor `appId` are:

```
app.lovable._0cea242b6aba4f5a9e4991997ef3b761
```

This UUID matches the Lovable project that owns the live-reload sandbox URL. If the package ID does not match the project that owns the `lovableproject.com` URL, the WebView will display a **"publish or update your Lovable project"** placeholder instead of your app.

The leading underscore is required because Java package segments cannot start with a digit.

**If you change this ID**, you must:
1. Uninstall the existing test APK from the device first (Android treats a changed `applicationId` as a brand-new app).
2. Update the same value in Google Play Console — once an app is published, the `applicationId` is locked and cannot be changed there.

## Capacitor Build Modes (READ FIRST)

`capacitor.config.ts` has two modes — switch before building the APK:

### Dev mode (current) — live reload from Lovable
The `server.url` block is enabled, pointing at the Lovable preview. The installed APK loads your live app over HTTPS — every code change in Lovable appears instantly on the phone with no rebuild.
- `allowMixedContent: true`
- `webContentsDebuggingEnabled: true`
- Use for: day-to-day testing on a physical device.
- Limitation: Google OAuth deep-link (`commodityhub://auth-callback`) won't fully round-trip in this mode — verify OAuth in production mode.

### Production mode — bundled `dist/` (Play Store)
Before generating the signed AAB:
1. Comment out the `server` block in `capacitor.config.ts`
2. Set `allowMixedContent: false` and `webContentsDebuggingEnabled: false`
3. Run `npm run build && npx cap sync android`
4. Build the signed release in Android Studio

After making changes in either direction, run `git pull` locally, then `npx cap sync android`, then rebuild the APK in Android Studio.

## Critical Production URLs & Services

### Health Check Endpoint
- **URL**: `https://your-domain.com/health`
- **Purpose**: System health monitoring for uptime services
- **Implementation**: Edge function already created

### API Rate Limits
- **FMP API**: Upgrade to paid plan (5000+ requests/day)
- **Alpha Vantage**: Monitor usage and upgrade if needed
- **Marketaux**: Consider premium for real-time news

### External Monitoring Services
- **Uptime Robot**: Monitor health endpoint
- **New Relic/DataDog**: Application performance monitoring
- **Sentry**: Error tracking and crash reporting

### Production Environment Variables
```bash
# In Supabase Edge Functions
FMP_API_KEY=your_production_fmp_key
ALPHA_VANTAGE_API_KEY=your_production_alpha_key
STRIPE_SECRET_KEY=your_production_stripe_key
DATABENTO_API_KEY=your_production_databento_key
ALERT_WEBHOOK_URL=your_monitoring_webhook
```

### Security Configuration
- Enable 2FA on all service accounts
- Set up API key rotation schedule
- Configure CORS for production domains only
- Enable rate limiting on all public endpoints

### Performance Optimization
- Configure CDN (Cloudflare/AWS CloudFront)
- Enable compression and caching
- Optimize image delivery
- Set up database connection pooling

### Backup & Recovery
- Configure automated database backups
- Set up point-in-time recovery
- Test disaster recovery procedures
- Document recovery workflows

## Launch Day Checklist
1. ✅ Database migrated and optimized
2. ✅ Capacitor switched to production mode (no `server.url`, mixed-content + webview-debug disabled)
3. ✅ PWA manifest + index.html brand colors aligned to `#1e3a5f`
4. ✅ Launcher icons + splash screens regenerated from `assets/brand/app-icon.svg`
5. ✅ Account-deletion flow live at `/delete-account` (Play Data Safety)
6. ✅ Privacy Policy + Terms of Service pages reachable
7. ✅ Production API keys configured in Supabase Edge Functions secrets
8. ⚠️ Supabase linter — 17 WARN-level findings remain (16 SECURITY DEFINER function exposure + 1 leaked-password protection). All non-blocking; review post-launch.
9. ⚠️ Generate signed AAB locally in Android Studio (see `mem://launch/android-signing`)
10. ⚠️ Upload to Play Console Internal Testing track first, then promote to Production

## Automated Android version bumping

Every Play Console upload requires a unique `versionCode`. Use the helper script before each release build so this happens automatically:

```bash
npm run android:release    # bumps patch + versionCode, builds web, runs cap sync
# or, granular:
npm run android:bump               # patch + 1 (e.g. 1.0.3 -> 1.0.4) and versionCode + 1
node scripts/bump-android-version.mjs minor       # 1.0.3 -> 1.1.0
node scripts/bump-android-version.mjs major       # 1.0.3 -> 2.0.0
node scripts/bump-android-version.mjs --code-only # only versionCode + 1
```

The script edits `android/app/build.gradle` in-place. Commit the change, then generate the signed AAB in Android Studio.
## Updating the app icon

The single source of truth is **`assets/brand/app-icon.svg`** (512×512, full-bleed).
Every raster icon in the repo is generated from it — do not hand-edit the PNGs.

```bash
npm run gen:icons
npx tauri icon assets/brand/app-icon.svg   # desktop icons only, see below
npx cap sync android
```

`npm run gen:icons` writes 41 files:

| Target | Files |
| --- | --- |
| Web / PWA | `public/icon.png`, `icon.png`, `public/favicon.ico`, `public/icons/icon-*.webp` |
| Play Store | `public/icons/icon-512-playstore.png`, `src/assets/play-app-icon-512.png` (1024²) |
| iOS | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (1024²) |
| Landing site | `landing/assets/app-icon.png` |
| Android launcher | `android/app/src/main/res/mipmap-*/ic_launcher{,_round,_foreground}.png` |
| Android splash | `android/app/src/main/res/drawable-{port,land}-*/splash.png`, `drawable/splash.png` |

Notes on how the generator handles the tricky targets:

- **Store icons carry no alpha channel** (App Store and Play both reject alpha), so
  they are flattened. Everything else keeps transparency.
- **`ic_launcher_foreground.png`** is the artwork *with the plate stripped* and scaled
  to `ADAPTIVE_SCALE` (0.60), because Android composites it over
  `@color/ic_launcher_background` and only guarantees the inner 72dp of the 108dp
  canvas is visible. The script asserts the rendered foreground fits inside that
  circle and fails loudly if it ever stops fitting — the artwork's true radius
  includes the ground shadow, which is wider than the objects themselves.
- **The icon plate is a gradient** (`#2E1D6B` → `#1B1140`), so
  `@color/ic_launcher_background` is set to its midpoint `#251756`. Keep
  `android/app/src/main/res/values/ic_launcher_background.xml` and the
  `adaptiveIcon.background` in `capacitor.config.ts` in step with each other.
- **The splash** composites the plate-less artwork over the legacy brand navy
  `#1e3a5f`. It must not use the full-bleed icon: that would paint a visible
  indigo square floating on the navy splash background.
- **Desktop (Tauri)** icons are *not* produced by this script — run
  `npx tauri icon assets/brand/app-icon.svg`. That command also emits
  `src-tauri/icons/{android,ios}/` directories which this project does not use
  (`tauri.conf.json` references only the desktop sizes); delete them afterwards.

After regenerating: in Android Studio do **Build → Clean Project → Rebuild**, uninstall
the previous APK from the device (Android caches launcher icons and splash drawables
aggressively), then install the new build.

## RevenueCat + Play Console launch checklist

Code-side IAP is verified (webhook tests pass, endpoint reachable, DB columns
present, secret set). The following are the **manual** steps that must be ticked
off before submitting to Play Store. Check each box as you go.

### A. RevenueCat dashboard
- [ ] **Entitlement** named exactly `premium` exists (Project → Entitlements).
- [ ] **Offering** is marked **Current** and has ≥1 package attached to the `premium` entitlement.
- [ ] **Products** in RevenueCat map to the Play Console subscription product IDs (same SKU strings).
- [ ] **Webhook** configured: URL `https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/revenuecat-webhook`, Authorization header set to `Bearer <REVENUECAT_WEBHOOK_AUTH>` (same value as the Supabase secret).
- [ ] **Play Service Account JSON** uploaded under Project → Apps → Google Play → Service Credentials.
- [ ] Android **public SDK key** in dashboard matches `VITE_REVENUECAT_API_KEY` (or `VITE_REVENUECAT_ANDROID_KEY`) in the `.env` used for the AAB build.

### B. Google Play Console
- [ ] **Subscription product** created (Monetize → Subscriptions) with the same product ID used in RevenueCat. Base plan + price set, status **Active**.
- [ ] **License testers** added (Setup → License testing) — your tester Google accounts, response set to `LICENSED`.
- [ ] **Internal testing track** created, signed AAB uploaded, testers opted in via the opt-in URL.
- [ ] App **signing key** managed by Play App Signing (already configured if you've uploaded before).
- [ ] **Data safety** form answers reflect subscription data collected by RevenueCat (purchase history, app interactions).

### C. On-device test (real Android device, license-tester account)
- [ ] Install via internal-testing opt-in link; sign in to Play with the **license tester** account.
- [ ] Open paywall → buy the subscription (Play shows *"This is a test purchase, you will not be charged"*).
- [ ] Premium content unlocks immediately; `hasActivePremium()` returns true.
- [ ] **Manage Subscription** button appears and deep-links to the Play subscription page.

### D. Webhook → DB verification
After the test purchase, in Supabase confirm the `profiles` row for that user:
- [ ] `subscription_active = true`
- [ ] `subscription_tier = 'premium'`
- [ ] `subscription_end` populated (ISO timestamp)
- [ ] `billing_state = 'active'`
- [ ] `grace_period_expires_at` is null
- [ ] `revenuecat-webhook` edge function logs show `RC INITIAL_PURCHASE for <user_id> → matched 1 row(s)`.

### E. Lifecycle states
- [ ] **Cancel** the subscription from Play Store → `CANCELLATION` webhook fires → row flips to `subscription_active=false`, `billing_state='canceled'`.
- [ ] **Restore purchases** on a fresh install of the same account re-unlocks premium.
- [ ] (Optional) Force a billing issue via Play test instruments → `billing_state='grace'`, `BillingStatusBanner` renders.

### F. Sign-off
- [ ] Bump version (`npm run android:bump`), regenerate AAB, re-upload to Internal track, smoke-test once more.
- [ ] Record results in `mem://launch/production-readiness` and promote AAB from Internal → Production.

## RevenueCat Web Billing (app.commodity-hub.eu)

Code side is done: `src/services/revenueCatWeb.ts`, `PremiumPaywall.tsx`, and
`ManageSubscriptionButton.tsx` all branch on `!Capacitor.isNativePlatform()` to
use `@revenuecat/purchases-js` instead of the mobile plugin. It's the same
entitlements (`premium`/`pro`) and the same `revenuecat-webhook` edge function
as Android — RevenueCat's webhook event schema doesn't distinguish which store
a purchase came from, so no backend change was needed for this. What's left is
dashboard config, same shape as section A above but for the Web Billing app:

- [ ] Stripe account connected to the RevenueCat project (done).
- [ ] RC project is on the **Pro plan** (required for Web Billing — free until
      $2,500 MTR, then 1% of MTR: Project settings → Plan).
- [ ] A **Web Billing app** added to the project (Project → Apps → Add app → Web Billing).
- [ ] **Products** created for the Web Billing app with identifiers following
      the *same* `premium_lite_monthly` / `premium_lite_annual` / `premium_monthly`
      / `premium_annual` convention as the Android products (`TIER_PRICING` in
      `src/utils/tiers.ts`) — the client splits packages into the Premium/Pro
      cards by checking `identifier.startsWith('premium_lite')`, so a different
      naming convention here will put everything in the Pro card.
- [ ] Those products attached to the existing `premium`/`pro` entitlements —
      same attachment as the Android products (`premium_lite_*` → `premium`
      only; `premium_*` → both `premium` and `pro`).
- [ ] Web Billing packages added to the same offering used by Android (or a
      dedicated one), and the offering stays marked **Current**.
- [ ] Web Billing **public API key** (Project settings → API keys → the Web
      Billing app's key, starts `rcb_`) set as `VITE_REVENUECAT_WEB_KEY` — in
      the root `.env` for local dev, and as an environment variable on the
      `commodity-hub` Vercel project (not `landing` — that's the separate
      marketing site) for production, since it's read at build time via
      `import.meta.env`.
- [ ] Webhook: nothing to add — the existing `revenuecat-webhook` URL/secret
      (section A) already covers Web Billing events from this same project.
- [ ] Test purchase with a Stripe test card, same verification as section D:
      confirm the `profiles` row updates and the paywall shows "already a
      subscriber" on reload.
