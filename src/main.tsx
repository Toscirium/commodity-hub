import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/smooth-scroll.css';
// Self-hosted via @fontsource rather than a Google Fonts <link>: this ships as
// a native Android app, where a webfont fetched over the network fails on a bad
// connection and falls back mid-session. Bundling also drops a third-party
// request from an EU-operated app. Keep these in sync with
// tailwind.config.ts's fontFamily — they drifted apart once before.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-sans-condensed/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { Capacitor } from '@capacitor/core';
import { redirectNativeOAuthCallbackFromWeb } from './utils/nativeOAuth';
import './lib/desktopBridge';

// Default to dark theme unless the user explicitly picked another.
(() => {
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
  const resolved = saved === 'light' ? 'light' : saved === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : 'dark';
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);
  if (!saved) localStorage.setItem('theme', 'dark');
})();

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('capacitor-native');
}

if (!redirectNativeOAuthCallbackFromWeb()) {
  void (async () => {
    const { default: App } = await import('./App');
    const root = createRoot(document.getElementById("root")!);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })();
}