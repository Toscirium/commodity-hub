export const NATIVE_AUTH_CALLBACK_URL = 'commodityhub://auth-callback';
export const NATIVE_OAUTH_REDIRECT_URL = NATIVE_AUTH_CALLBACK_URL;

/**
 * Hosted web URL Supabase should redirect to after Google OAuth on native.
 * The page at this URL detects `native=1` and bridges the OAuth payload
 * back into the installed app via an Android intent (see
 * `redirectNativeOAuthCallbackFromWeb`). This is far more reliable than asking
 * Chrome Custom Tabs to follow a `commodityhub://` redirect directly, which
 * many Android/Chrome versions silently drop.
 */
export const NATIVE_OAUTH_WEB_BRIDGE_URL =
  'https://commodity-hub.lovable.app/?native=1';

const ANDROID_PACKAGE_NAME = 'app.lovable.c8fabd7a96c74aff8d7b001690ec23c7';
const ANDROID_PACKAGE_CANDIDATES = [
  // Current native package in android/app/build.gradle.
  ANDROID_PACKAGE_NAME,
  // Earlier production/store package references still exist in the project.
  // Trying more than one avoids leaving the user signed in only in Chrome if
  // their installed APK/AAB was built with a different applicationId.
  'com.commodityhub.app',
  'app.lovable._0cea242b6aba4f5a9e4991997ef3b761',
];

const OAUTH_SEARCH_KEYS = ['code', 'error', 'error_description', 'error_code'];
const OAUTH_HASH_KEYS = [
  'access_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'expires_at',
  'type',
  'error',
  'error_description',
  'error_code',
];
const OAUTH_CALLBACK_KEYS = [...OAUTH_SEARCH_KEYS, ...OAUTH_HASH_KEYS];

const hasAnyParam = (params: URLSearchParams, keys: string[]) =>
  keys.some((key) => params.has(key));

export const buildNativeAuthCallbackUrl = (callbackHref: string) => {
  const callbackUrl = new URL(callbackHref);
  const sourceSearchParams = new URLSearchParams(callbackUrl.search);
  const searchParams = new URLSearchParams();

  for (const key of OAUTH_CALLBACK_KEYS) {
    const value = sourceSearchParams.get(key);
    if (value) searchParams.set(key, value);
  }

  // Supabase implicit OAuth returns tokens in the URL fragment. Android intent
  // URLs use `#Intent` as their own delimiter, so a normal fragment would be
  // swallowed by Chrome instead of delivered to the app. Move callback fragment
  // params into the custom-scheme query string before building the intent. Only
  // forward Supabase session fields; Google provider tokens are not needed by
  // the app and make the Android intent URL unnecessarily long/fragile.
  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
  for (const key of OAUTH_CALLBACK_KEYS) {
    const value = hashParams.get(key);
    if (value && !searchParams.has(key)) searchParams.set(key, value);
  }

  const search = searchParams.toString();
  return `${NATIVE_AUTH_CALLBACK_URL}${search ? `?${search}` : ''}`;
};

export const buildAndroidIntentCallbackUrl = (callbackHref: string, packageName?: string) => {
  const appCallbackUrl = buildNativeAuthCallbackUrl(callbackHref);
  const parsedCallback = new URL(appCallbackUrl);
  const fallbackUrl = encodeURIComponent(callbackHref);

  return `intent://${parsedCallback.host}${parsedCallback.pathname}${parsedCallback.search}${parsedCallback.hash}` +
    `#Intent;scheme=${parsedCallback.protocol.replace(':', '')};` +
    `${packageName ? `package=${packageName};` : ''}` +
    `S.browser_fallback_url=${fallbackUrl};end`;
};

export const redirectNativeOAuthCallbackFromWeb = () => {
  if (typeof window === 'undefined') return false;

  const callbackUrl = new URL(window.location.href);
  if (callbackUrl.searchParams.get('native') !== '1') return false;

  const hashParams = new URLSearchParams(callbackUrl.hash.replace(/^#/, ''));
  const hasOAuthPayload =
    hasAnyParam(callbackUrl.searchParams, OAUTH_SEARCH_KEYS) ||
    hasAnyParam(hashParams, OAUTH_HASH_KEYS);

  if (!hasOAuthPayload) return false;

  const appCallbackUrl = buildNativeAuthCallbackUrl(callbackUrl.href);
  const androidIntentUrls = [
    // First let Android resolve the app by scheme. This is more reliable when
    // older installed builds use a different package name than the current
    // source tree. Then try explicit package-targeted intents as fallbacks.
    buildAndroidIntentCallbackUrl(callbackUrl.href),
    ...ANDROID_PACKAGE_CANDIDATES.map((packageName) =>
      buildAndroidIntentCallbackUrl(callbackUrl.href, packageName)
    ),
    appCallbackUrl,
  ];

  const openInstalledApp = () => {
    androidIntentUrls.forEach((url, index) => {
      window.setTimeout(() => {
        window.location.href = url;
      }, index * 450);
    });
  };

  window.setTimeout(() => {
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#f8fafc;font-family:system-ui,sans-serif;padding:24px;text-align:center">
        <div>
          <h1 style="font-size:22px;margin:0 0 8px">Opening Commodity Hub</h1>
          <p style="margin:0 0 20px;color:#cbd5e1">If the app did not open, return to your installed Commodity Hub app.</p>
          <button id="open-app" type="button" style="appearance:none;border:0;border-radius:8px;background:#2dd4bf;color:#042f2e;font-weight:700;padding:12px 18px">Open app</button>
        </div>
      </main>
    `;
    document.getElementById('open-app')?.addEventListener('click', openInstalledApp);
  }, 1200);

  openInstalledApp();
  return true;
};