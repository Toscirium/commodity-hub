// Shape of the desktop bridge, backed by the Tauri shell (src-tauri/) via
// @tauri-apps/api. Only present when running inside the Tauri desktop app.
export interface DesktopBridge {
  isDesktop: true;
  openExternal: (url: string) => Promise<void>;
  onAuthDeepLink: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}
