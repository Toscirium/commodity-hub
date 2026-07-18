import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/smooth-scroll.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import { Capacitor } from '@capacitor/core';
import { redirectNativeOAuthCallbackFromWeb } from './utils/nativeOAuth';

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