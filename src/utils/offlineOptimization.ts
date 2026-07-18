/**
 * Offline functionality optimization for mobile app
 */

interface CacheConfig {
  name: string;
  urls: string[];
  strategies: {
    [key: string]: 'cache-first' | 'network-first' | 'cache-only' | 'network-only';
  };
}

// Service Worker cache configuration
export const CACHE_CONFIG: CacheConfig = {
  name: 'commodity-hub-v1',
  urls: [
    // Core app files
    '/',
    '/src/main.tsx',
    '/src/index.css',
    
    // Static assets
    '/icons/icon-192.webp',
    '/icons/icon-512.webp',
    '/manifest.json',
    
    // Critical pages
    '/dashboard',
    '/portfolio',
    '/auth',
  ],
  strategies: {
    // API calls - network first with cache fallback
    '/supabase/functions/': 'network-first',
    
    // Static assets - cache first
    '/icons/': 'cache-first',
    '/screenshots/': 'cache-first',
    
    // Dynamic content - network first
    '/api/': 'network-first',
    
    // Core app - cache first with network update
    '/': 'cache-first',
  }
};

// Offline data storage
export class OfflineStorage {
  private dbName = 'CommodityHubOffline';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create stores for offline data
        if (!db.objectStoreNames.contains('commodities')) {
          const commodityStore = db.createObjectStore('commodities', { keyPath: 'symbol' });
          commodityStore.createIndex('lastUpdated', 'lastUpdated');
        }
        
        if (!db.objectStoreNames.contains('portfolio')) {
          db.createObjectStore('portfolio', { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains('news')) {
          const newsStore = db.createObjectStore('news', { keyPath: 'id' });
          newsStore.createIndex('publishedAt', 'publishedAt');
        }
        
        if (!db.objectStoreNames.contains('userSettings')) {
          db.createObjectStore('userSettings', { keyPath: 'key' });
        }
      };
    });
  }

  async storeCommodityData(symbol: string, data: any): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['commodities'], 'readwrite');
    const store = transaction.objectStore('commodities');
    
    await store.put({
      symbol,
      data,
      lastUpdated: Date.now()
    });
  }

  async getCommodityData(symbol: string): Promise<any> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['commodities'], 'readonly');
    const store = transaction.objectStore('commodities');
    
    return new Promise((resolve, reject) => {
      const request = store.get(symbol);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async storePortfolio(portfolio: any): Promise<void> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['portfolio'], 'readwrite');
    const store = transaction.objectStore('portfolio');
    
    await store.put({
      id: 'current',
      data: portfolio,
      lastUpdated: Date.now()
    });
  }

  async getPortfolio(): Promise<any> {
    if (!this.db) await this.init();
    
    const transaction = this.db!.transaction(['portfolio'], 'readonly');
    const store = transaction.objectStore('portfolio');
    
    return new Promise((resolve, reject) => {
      const request = store.get('current');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async clearExpiredData(): Promise<void> {
    if (!this.db) await this.init();
    
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    // Clear old commodity data
    const commodityTransaction = this.db!.transaction(['commodities'], 'readwrite');
    const commodityStore = commodityTransaction.objectStore('commodities');
    const commodityIndex = commodityStore.index('lastUpdated');
    
    const commodityRange = IDBKeyRange.upperBound(oneDayAgo);
    commodityIndex.openCursor(commodityRange).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    
    // Clear old news data
    const newsTransaction = this.db!.transaction(['news'], 'readwrite');
    const newsStore = newsTransaction.objectStore('news');
    const newsIndex = newsStore.index('publishedAt');
    
    const newsRange = IDBKeyRange.upperBound(oneDayAgo);
    newsIndex.openCursor(newsRange).onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  }
}

// Background sync for offline actions
export class BackgroundSync {
  private syncQueue: Array<{
    id: string;
    action: string;
    data: any;
    timestamp: number;
  }> = [];

  addToQueue(action: string, data: any): string {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    this.syncQueue.push({
      id,
      action,
      data,
      timestamp: Date.now()
    });
    
    // Store in localStorage as backup
    localStorage.setItem('syncQueue', JSON.stringify(this.syncQueue));
    
    return id;
  }

  async processQueue(): Promise<void> {
    if (!navigator.onLine || this.syncQueue.length === 0) {
      return;
    }

    const queueCopy = [...this.syncQueue];
    this.syncQueue = [];
    
    for (const item of queueCopy) {
      try {
        await this.processAction(item);
      } catch (error) {
        console.error('Failed to sync action:', item.action, error);
        // Re-add to queue for retry
        this.syncQueue.push(item);
      }
    }
    
    // Update localStorage
    localStorage.setItem('syncQueue', JSON.stringify(this.syncQueue));
  }

  private async processAction(item: any): Promise<void> {
    switch (item.action) {
      case 'updatePortfolio':
        // Sync portfolio changes
        await this.syncPortfolioUpdate(item.data);
        break;
      case 'addWatchlistItem':
        // Sync watchlist additions
        await this.syncWatchlistAdd(item.data);
        break;
      case 'removeWatchlistItem':
        // Sync watchlist removals
        await this.syncWatchlistRemove(item.data);
        break;
      default:
        console.warn('Unknown sync action:', item.action);
    }
  }

  private async syncPortfolioUpdate(data: any): Promise<void> {
    // Implement portfolio sync logic
    const response = await fetch('/supabase/functions/portfolio-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync portfolio');
    }
  }

  private async syncWatchlistAdd(data: any): Promise<void> {
    // Implement watchlist add sync logic
    const response = await fetch('/supabase/functions/watchlist-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync watchlist add');
    }
  }

  private async syncWatchlistRemove(data: any): Promise<void> {
    // Implement watchlist remove sync logic
    const response = await fetch('/supabase/functions/watchlist-remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync watchlist remove');
    }
  }

  loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('syncQueue');
      if (stored) {
        this.syncQueue = JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load sync queue from storage:', error);
    }
  }
}

// Network status monitoring
export const networkMonitor = {
  isOnline: navigator.onLine,
  
  init() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.onOnline();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.onOffline();
    });
  },
  
  onOnline() {
    // Sync offline actions
    const syncManager = new BackgroundSync();
    syncManager.loadFromStorage();
    syncManager.processQueue();
    
    // Show online notification
    if ('serviceWorker' in navigator && 'showNotification' in ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification('Back Online', {
          body: 'Syncing your offline changes...',
          icon: '/icons/icon-192.webp',
          tag: 'network-status'
        });
      });
    }
  },
  
  onOffline() {
    // Show offline notification
    if ('serviceWorker' in navigator && 'showNotification' in ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification('Offline Mode', {
          body: 'You can continue using the app offline',
          icon: '/icons/icon-192.webp',
          tag: 'network-status'
        });
      });
    }
  }
};

// Create singleton instances
export const offlineStorage = new OfflineStorage();
export const backgroundSync = new BackgroundSync();