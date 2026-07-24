// Shape of the bridge exposed by electron/preload.cjs via contextBridge.
// Only present when running inside the Electron desktop shell.
export interface ElectronBridge {
  isElectron: true;
  platform: string;
  openExternal: (url: string) => Promise<void>;
  onAuthDeepLink: (callback: (url: string) => void) => () => void;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
  }
}
