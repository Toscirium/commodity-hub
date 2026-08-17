
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.c8fabd7a96c74aff8d7b001690ec23c7',
  appName: 'Commodity Hub',
  webDir: 'dist',
  // PRODUCTION MODE: bundled `dist/` is loaded from the APK/AAB.
  // To switch back to dev/live-reload, restore the `server` block:
  //   server: {
  //     url: 'https://0cea242b-6aba-4f5a-9e49-91997ef3b761.lovableproject.com?forceHideBadge=true',
  //     cleartext: true,
  //   },
  // and set allowMixedContent / webContentsDebuggingEnabled back to true below.
  plugins: {
    // NOTE: there is no SplashScreen block here. @capacitor/splash-screen
    // isn't a dependency of this project (checked: not in package.json,
    // not in node_modules, and `cap sync` doesn't list it among installed
    // plugins) — a SplashScreen config here would be silently inert, not
    // actually control anything. If a real native splash screen is wanted,
    // that means installing @capacitor/splash-screen properly and calling
    // SplashScreen.hide() once the app is actually ready, not just
    // re-adding this config block.
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e3a5f"
    },
    // Native Google Sign-In is configured at runtime via
    // SocialLogin.initialize() in AuthContext (see signInWithGoogle) using
    // VITE_GOOGLE_WEB_CLIENT_ID. Google is the only provider this app
    // actually calls (grep confirms no facebook/apple/twitter provider
    // calls anywhere) — the plugin bundles all four by default unless told
    // otherwise, and per its own README, Facebook's SDK pulls in the
    // com.google.android.gms.permission.AD_ID permission regardless of
    // whether Facebook login is ever used. Disabling it here removes that
    // permission from the merged manifest, which is what makes "No" to
    // Play Console's advertising ID declaration actually true rather than
    // just currently-unused. Twitter dropped too since it's also unused
    // (no bundled deps either way, so no size/manifest impact either way —
    // disabled for accuracy). Apple stays enabled: system APIs only, zero
    // cost, and free future-proofing if Apple Sign-In is ever added.
    SocialLogin: {
      providers: {
        google: true,
        facebook: false,
        apple: true,
        twitter: false,
      },
    },
  },
  android: {
    // The real source of truth for the Gradle build is android/variables.gradle
    // (already 36/23 — these capacitor.config.ts fields don't get synced into
    // it by `cap sync`, verified directly). Kept in step here so this file
    // doesn't mislead anyone reading it about what's actually being built —
    // Google Play requires targeting API 36 (Android 16) from 2026-08-31.
    compileSdkVersion: 36,
    minSdkVersion: 23,
    targetSdkVersion: 36,
    iconDensity: 'mdpi',
    adaptiveIcon: {
      foreground: 'icon.png',
      background: '#1e3a5f'
    },
    allowMixedContent: false,
    // captureInput must stay false on Android — when true, the WebView
    // intercepts key events and interferes with Gboard's IME composition,
    // causing visible lag on Backspace inside text inputs.
    captureInput: false,
    webContentsDebuggingEnabled: false
  },
  ios: {
    contentInset: 'automatic',
    icon: 'icon.png',
    scheme: 'commodityhub',
    allowsLinkPreview: false
  },
  // Global icon configuration
  icon: 'icon.png'
};

export default config;
