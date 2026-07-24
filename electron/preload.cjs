const { contextBridge, ipcRenderer } = require('electron');

// Bridge so renderer code can detect it's running inside the desktop shell
// (e.g. to skip service-worker registration or the Capacitor-only native
// deep-link hook) and reach the handful of main-process-only APIs it needs.
// Extend as later phases add IPC needs (native notifications, tray, updater
// status).
contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  platform: process.platform,

  // Opens an https:// URL in the system default browser (main process
  // enforces the https-only restriction). Used for OAuth sign-in instead of
  // navigating the app window itself, since Google blocks embedded/WebView
  // user agents from completing OAuth.
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Subscribes to commodityhub:// OAuth callback URLs forwarded from the
  // main process (cold start argv, second-instance argv, or the 'open-url'
  // event). Returns an unsubscribe function.
  onAuthDeepLink: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on('auth-deep-link', listener);
    return () => ipcRenderer.removeListener('auth-deep-link', listener);
  },
});
