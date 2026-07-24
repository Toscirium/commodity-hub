// Populates window.desktop when running inside the Tauri shell (src-tauri/).
// Replaces the Electron contextBridge preload — Tauri's webview already runs
// frontend code with direct (but permission-gated, see
// src-tauri/capabilities/default.json) access to @tauri-apps/api, so no
// separate preload process is needed. Imported once from src/main.tsx.
import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

if (isTauri()) {
  window.desktop = {
    isDesktop: true,

    // Opens an https:// URL in the system default browser (the Rust side
    // enforces the https-only restriction). Used for OAuth sign-in instead
    // of navigating the app window itself, since Google blocks
    // embedded/WebView user agents from completing OAuth.
    openExternal: (url: string) => invoke('open_external', { url }),

    // Subscribes to commodityhub:// OAuth callback URLs forwarded from the
    // Rust side (cold start argv, second-instance argv, or the macOS
    // open-url event). Returns an unsubscribe function.
    onAuthDeepLink: (callback: (url: string) => void) => {
      let unlisten: (() => void) | undefined;
      let cancelled = false;
      listen<string>('auth-deep-link', (event) => callback(event.payload)).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    },
  };
}
