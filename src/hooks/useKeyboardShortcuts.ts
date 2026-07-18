import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

// Keep existing simple hook for backwards compatibility
interface UseKeyboardShortcutOptions {
  preventDefault?: boolean;
  stopPropagation?: boolean;
  enabled?: boolean;
}

export const useKeyboardShortcut = (
  key: string | string[],
  callback: (event: KeyboardEvent) => void,
  options: UseKeyboardShortcutOptions = {}
) => {
  const {
    preventDefault = true,
    stopPropagation = true,
    enabled = true,
  } = options;

  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  React.useEffect(() => {
    if (!enabled) return;

    const handleKeyPress = (event: KeyboardEvent) => {
      const keys = Array.isArray(key) ? key : [key];
      const pressedKey = event.key.toLowerCase();
      
      if (keys.some(k => k.toLowerCase() === pressedKey)) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        
        callbackRef.current(event);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [key, preventDefault, stopPropagation, enabled]);
};

export const useEscapeKey = (callback: () => void, enabled = true) => {
  useKeyboardShortcut('Escape', callback, { enabled });
};

export const useArrowNavigation = (
  onUp: () => void,
  onDown: () => void,
  onLeft?: () => void,
  onRight?: () => void,
  enabled = true
) => {
  const noop = () => {};
  useKeyboardShortcut('ArrowUp', onUp, { enabled });
  useKeyboardShortcut('ArrowDown', onDown, { enabled });
  useKeyboardShortcut('ArrowLeft', onLeft ?? noop, { enabled: enabled && !!onLeft });
  useKeyboardShortcut('ArrowRight', onRight ?? noop, { enabled: enabled && !!onRight });
};

// Advanced keyboard shortcuts system
interface ShortcutAction {
  description: string;
  action: () => void;
  category?: string;
}

interface KeyboardShortcuts {
  [key: string]: ShortcutAction;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showHelp, setShowHelp] = React.useState(false);
  const [pressedKeys, setPressedKeys] = React.useState<string[]>([]);
  const [keySequence, setKeySequence] = React.useState<string>('');

  const shortcuts: KeyboardShortcuts = {
    // Navigation shortcuts
    'g d': {
      description: 'Go to Dashboard',
      action: () => navigate('/dashboard'),
      category: 'Navigation'
    },
    'g p': {
      description: 'Go to Portfolio',
      action: () => navigate('/portfolio'),
      category: 'Navigation'
    },
    'g s': {
      description: 'Go to Market Screener',
      action: () => navigate('/screener'),
      category: 'Navigation'
    },
    'g w': {
      description: 'Go to Watchlists',
      action: () => navigate('/watchlists'),
      category: 'Navigation'
    },
    'g c': {
      description: 'Go to Calendar',
      action: () => navigate('/calendar'),
      category: 'Navigation'
    },
    'g i': {
      description: 'Go to Insights',
      action: () => navigate('/insights'),
      category: 'Navigation'
    },
    'g l': {
      description: 'Go to Learning Hub',
      action: () => navigate('/learning'),
      category: 'Navigation'
    },
    
    // Action shortcuts
    '/': {
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        } else {
          toast({
            title: 'Search not available',
            description: 'No search input found on this page',
          });
        }
      },
      category: 'Actions'
    },
    
    'r': {
      description: 'Refresh data',
      action: () => {
        window.location.reload();
      },
      category: 'Actions'
    },
    
    'Escape': {
      description: 'Close modals/dialogs',
      action: () => {
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement && activeElement.blur) {
          activeElement.blur();
        }
        
        // Close any open dialogs or modals
        const closeButtons = document.querySelectorAll('[data-dialog-close], [aria-label="Close"]');
        if (closeButtons.length > 0) {
          (closeButtons[0] as HTMLElement).click();
        }
      },
      category: 'Actions'
    },
    
    // Theme shortcuts
    't': {
      description: 'Toggle theme',
      action: () => {
        const themeToggle = document.querySelector('[data-theme-toggle]') as HTMLElement;
        if (themeToggle) {
          themeToggle.click();
        } else {
          // Fallback theme toggle
          const currentTheme = localStorage.getItem('theme') || 'system';
          const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
          localStorage.setItem('theme', newTheme);
          document.documentElement.classList.toggle('dark', newTheme === 'dark');
          toast({
            title: 'Theme changed',
            description: `Switched to ${newTheme} mode`,
          });
        }
      },
      category: 'Appearance'
    },
    
    // Help shortcuts
    '?': {
      description: 'Show keyboard shortcuts',
      action: () => setShowHelp(true),
      category: 'Help'
    },
    
    'h': {
      description: 'Show help',
      action: () => setShowHelp(true),
      category: 'Help'
    }
  };

  const handleKeyDown = React.useCallback((event: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      // Allow Escape to work everywhere
      if (event.key === 'Escape') {
        shortcuts['Escape'].action();
      }
      return;
    }

    // Handle modifier keys differently
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    event.preventDefault();
    
    const key = event.key.toLowerCase();
    
    // Handle single key shortcuts
    if (shortcuts[key]) {
      shortcuts[key].action();
      return;
    }
    
    // Handle key sequences (like "g d" for go to dashboard)
    if (key === 'g') {
      setKeySequence('g');
      setPressedKeys(['g']);
      
      // Clear sequence after 2 seconds
      setTimeout(() => {
        setKeySequence('');
        setPressedKeys([]);
      }, 2000);
      
      return;
    }
    
    // Check for two-key sequences
    if (keySequence === 'g') {
      const sequence = `g ${key}`;
      if (shortcuts[sequence]) {
        shortcuts[sequence].action();
        setKeySequence('');
        setPressedKeys([]);
        return;
      }
    }
    
    // Reset sequence if no match
    setKeySequence('');
    setPressedKeys([]);
  }, [keySequence, shortcuts, navigate, toast]);

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const closeHelp = () => setShowHelp(false);

  const getShortcutsByCategory = () => {
    const categorized: { [category: string]: { [key: string]: ShortcutAction } } = {};
    
    Object.entries(shortcuts).forEach(([key, action]) => {
      const category = action.category || 'Other';
      if (!categorized[category]) {
        categorized[category] = {};
      }
      categorized[category][key] = action;
    });
    
    return categorized;
  };

  return {
    shortcuts,
    showHelp,
    closeHelp,
    getShortcutsByCategory,
    currentKeySequence: keySequence,
    pressedKeys
  };
}
