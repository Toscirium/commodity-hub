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
4. ✅ Launcher icons + splash screens regenerated from `public/icon.png`
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
## Updating the launcher icon

The single source of truth for the app icon is `public/icon.png` (512×512 RGBA).
This same file is used for the Play Store listing (`public/icons/icon-512-playstore.png` is a byte-identical copy) and as the input for every Android mipmap density.

To regenerate every Android launcher icon (mdpi → xxxhdpi, square + round + adaptive foreground):

```bash
python scripts/generate-android-icons.py
npx cap sync android
```

The script writes to `android/app/src/main/res/mipmap-*/`:
- `ic_launcher.png` — square legacy icon on brand background `#1e3a5f`
- `ic_launcher_round.png` — circular legacy icon
- `ic_launcher_foreground.png` — adaptive-icon foreground (logo in inner 66% safe-zone, transparent bleed; composed by Android over `@color/ic_launcher_background` via `mipmap-anydpi-v26/ic_launcher.xml`)

After regenerating: in Android Studio do **Build → Clean Project → Rebuild**, uninstall the previous APK from the device (Android caches launcher icons aggressively), then install the new build.

## Updating the Android splash screen

The native Android splash uses the same `public/icon.png` source over the brand
background `#1e3a5f` (matching `@color/ic_launcher_background` and the
Capacitor `SplashScreen.backgroundColor` in `capacitor.config.ts`).

To regenerate every density (mdpi → xxxhdpi) for both portrait and landscape,
plus the legacy default `drawable/splash.png`:

```bash
python scripts/generate-android-splash.py
npx cap sync android
```

The script writes to `android/app/src/main/res/drawable-port-*/splash.png`,
`drawable-land-*/splash.png`, and `drawable/splash.png`. It preserves the
canonical Capacitor pixel dimensions per density (e.g. xxxhdpi portrait =
1280×1920, landscape = 1920×1280) and centers the logo at 40% of the
shorter side so it never clips on tall or wide devices.

After regenerating, do **Build → Clean Project → Rebuild** in Android Studio
and reinstall — the splash drawable is cached aggressively just like the
launcher icon.

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
