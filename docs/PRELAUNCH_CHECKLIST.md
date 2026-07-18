# Commodity Hub — Pre-Launch Checklist

Last refreshed: 2026-06-24. Tick each item before promoting a build to Google Play production.

---

## 1. Google Play Submission

### Store listing
- [ ] App title ≤ 30 chars, short description ≤ 80 chars, full description ≤ 4000 chars
- [ ] App icon (512×512 PNG, no alpha) uploaded
- [ ] Feature graphic (1024×500) uploaded
- [ ] Phone screenshots (min 2, 1080×1920 or similar) uploaded
- [ ] 7" + 10" tablet screenshots uploaded (if targeting tablets)
- [ ] Promo video (optional) linked
- [ ] Category set to **Finance**, tags reviewed
- [ ] Contact email + website + privacy policy URLs verified live

### Build & signing
- [ ] `versionCode` bumped in `android/app/build.gradle`
- [ ] `versionName` matches release notes
- [ ] Release build signed with upload keystore (Play App Signing enrolled)
- [ ] AAB built with `./gradlew bundleRelease` and tested on a physical device
- [ ] ProGuard / R8 rules verified — no missing classes at runtime
- [ ] Target SDK meets current Play requirement

### Data Safety & policies
- [ ] Data Safety form matches `src/utils/playStoreCompliance.ts → PRIVACY_SETTINGS`
- [ ] Content rating questionnaire submitted (Teen / 18+ as applicable)
- [ ] Ads declaration: **No ads**
- [ ] In-app products / pricing model declared accurately
- [ ] Permissions justified (currently only `INTERNET`)
- [ ] Account deletion URL reachable and tested end-to-end

### Release track
- [ ] Internal testing track passed by ≥ 3 testers
- [ ] Closed / open testing reviewed for crashes in Play Console → Vitals
- [ ] Staged rollout percentage chosen (start 10–20%)

---

## 2. Auth & Deep-Link (Capacitor / Supabase)

-[*] Supabase **Site URL** = `https://commodity-hub.lovable.app`****
- [*] Supabase **Redirect URLs** include:
  - [*] `https://commodity-hub.lovable.app/?native=1` (web bridge)
  - [*] `commodityhub://auth-callback`
  - [*] `https://commodity-hub.lovable.app/**`
- [*] Google Cloud OAuth client → Authorized redirect URIs include the Supabase `/auth/v1/callback` URL
- [*] `AndroidManifest.xml` intent filter for scheme `commodityhub` present and `autoVerify` set correctly
- [*] `capacitor.config.ts` `appId` matches `applicationId` in `build.gradle`
- [*] `NATIVE_OAUTH_WEB_BRIDGE_URL` used in `AuthContext.tsx` for native sign-in
- [*] `useCapacitorAuthDeepLink` registered in `main.tsx` / `App.tsx`
- [ ] Cold-start deep link (app killed → click email link → returns to app signed-in) tested
- [ ] Warm deep link (app backgrounded) tested
- [*] Google sign-in tested on a fresh install, no cached session
- [ ] Email magic link tested on a fresh install
- [ ] Password reset deep link returns to in-app reset screen
- [ ] Sign-out clears Supabase session and Capacitor Preferences

---

## 3. Technical Readiness

- [ ] `npm run build` clean (no warnings introduced this release)
- [ ] `npm run lint` passes
- [ ] `npm test` / Vitest suite green
- [ ] Playwright e2e (`tests/e2e/`) green against preview
- [ ] Lighthouse score ≥ 90 on Performance, Accessibility, Best Practices, SEO
- [ ] No `console.error` on cold load (check `useCapacitorAuthDeepLink`, RealtimeDataContext)
- [ ] Sentry / crash reporting receiving events from release build
- [ ] Supabase edge functions deployed and health-checked (`/health-check`)
- [ ] Rate limits verified for `enhanced-commodity-news`, `fetch-all-commodities-v2`
- [ ] Offline mode renders cached data + `OfflineIndicator`
- [ ] Push notifications registered (FCM token visible in `device_tokens`)
- [ ] Background fetch / price-alert evaluator scheduled
- [ ] App icons + splash regenerated (`scripts/generate-android-icons.py`, `…-splash.py`)
- [ ] Bundle size budget respected (`vite build` report)

---

## 4. Legal & Compliance

- [ ] `/privacy-policy` reflects current data collection (Supabase, FMP, OilPriceAPI, RevenueCat, FCM)
- [ ] `/terms-of-service` reviewed for current monetization model
- [ ] Financial disclaimer visible ("not financial advice")
- [ ] Verify the deployed account-deletion flow (`/delete-account`) purges all applicable user data
- [ ] GDPR: data export available on request (documented in privacy policy)
- [ ] Cookie / storage notice covers `localStorage` encrypted credentials
- [ ] Third-party licenses page or attribution screen present
- [ ] Age gate / target audience matches Play Console declaration
- [ ] DPA in place with all sub-processors (Supabase, Google, RevenueCat)
- [ ] Support email monitored and auto-responder configured

---

## Final go / no-go

- [ ] Release notes drafted (EN + any localized stores)
- [ ] Rollback plan documented (previous AAB archived, halt-rollout steps known)
- [ ] On-call owner identified for first 48 h post-launch
- [ ] Marketing / social posts scheduled
- [ ] Analytics dashboards bookmarked (Play Vitals, Supabase, RevenueCat)
