import React from 'react';

/**
 * "Professional view" — a presentation mode for showing the analytics layer
 * to prospects (trading firms, procurement teams) without the parts of the
 * app that read as retail: the Trade/CFD affiliate section, Market
 * Sentiment community voting, and Portfolio/Watchlists in the main nav.
 *
 * Deliberately light-touch, not an access-control boundary: it hides those
 * items from navigation and from the TradeCTA affiliate component, but does
 * not route-guard /trade, /portfolio, or /sentiment themselves, and changes
 * nothing about entitlements, data, or existing users — this is a
 * reversible way to demo, not a second product tier. See docs/PRO_VIEW.md.
 *
 * Persisted per-device in localStorage (not per-account): the enable path is
 * visiting /pro, which is meant to be a link sent to a specific prospect on
 * a specific device, not a setting someone consciously opts into.
 */

const STORAGE_KEY = 'ch_pro_view';

interface ProViewContextType {
  isProView: boolean;
  setProView: (enabled: boolean) => void;
}

const ProViewContext = React.createContext<ProViewContextType | null>(null);

function readStoredValue(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private browsing / storage disabled — default to the normal (retail) view.
    return false;
  }
}

export const ProViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isProView, setIsProView] = React.useState<boolean>(readStoredValue);

  const setProView = React.useCallback((enabled: boolean) => {
    setIsProView(enabled);
    try {
      if (enabled) {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Storage unavailable — the in-memory state above still applies for this session.
    }
  }, []);

  const value = React.useMemo(() => ({ isProView, setProView }), [isProView, setProView]);

  return <ProViewContext.Provider value={value}>{children}</ProViewContext.Provider>;
};

// Fails safe rather than throwing when rendered outside a ProViewProvider —
// e.g. a component test that mounts TradeCTA or MarketToolsList in
// isolation, or a future Storybook story. Unlike an auth context, getting
// this "wrong" just means the ordinary retail view renders; there's no
// correctness or security reason to crash the tree over it.
const DEFAULT_VALUE: ProViewContextType = { isProView: false, setProView: () => {} };

export const useProView = (): ProViewContextType => {
  const context = React.useContext(ProViewContext);
  return context ?? DEFAULT_VALUE;
};
