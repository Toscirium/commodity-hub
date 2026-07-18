import { useState, useCallback, useEffect } from 'react';

// Custom event name for same-tab sync
const LOCAL_STORAGE_CHANGE_EVENT = 'local-storage-change';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T) => {
    setStoredValue(value);
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      // Dispatch custom event for same-tab listeners
      window.dispatchEvent(new CustomEvent(LOCAL_STORAGE_CHANGE_EVENT, { detail: { key } }));
    } catch {
      console.warn('Failed to save to localStorage');
    }
  }, [key]);

  useEffect(() => {
    // Sync from other hook instances in same tab
    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === key) {
        try {
          const item = window.localStorage.getItem(key);
          if (item) setStoredValue(JSON.parse(item));
        } catch { /* ignore */ }
      }
    };

    // Sync from other tabs
    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch { /* ignore */ }
      }
    };

    window.addEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);
    return () => {
      window.removeEventListener(LOCAL_STORAGE_CHANGE_EVENT, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [key]);

  return [storedValue, setValue];
}
