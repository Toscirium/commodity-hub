
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
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1e3a5f",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#ffffff"
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1e3a5f"
    },
    // Native Google Sign-In is configured at runtime via
    // SocialLogin.initialize() in AuthContext (see signInWithGoogle) using
    // VITE_GOOGLE_WEB_CLIENT_ID. No static plugin config needed here.
  },
  android: {
    compileSdkVersion: 35,
    minSdkVersion: 22,
    targetSdkVersion: 35,
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
