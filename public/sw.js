// Service Worker for offline caching and performance
const CACHE_NAME = 'commodity-hub-v2';
const STATIC_CACHE = 'static-v2';
const DYNAMIC_CACHE = 'dynamic-v2';
const API_CACHE = 'api-v2';

// Critical assets to cache immediately for faster app startup
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  // Preload critical chunks for faster initial load
  '/assets/index.css'
];

// Additional static assets to cache on first use
const STATIC_ASSETS = [
  '/robots.txt',
  // Add other static assets as they're discovered
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/commodities',
  '/api/prices',
  '/api/news',
  '/api/market-status'
];

// Cache strategies
const CACHE_STRATEGIES = {
  NETWORK_FIRST: 'network-first',
  CACHE_FIRST: 'cache-first',
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate',
  NETWORK_ONLY: 'network-only',
  CACHE_ONLY: 'cache-only'
};

// Install event - cache critical assets immediately
self.addEventListener('install', event => {
  console.log('SW: Installing service worker v2');
  
  event.waitUntil(
    Promise.all([
      // Cache critical assets first for fastest startup
      caches.open(STATIC_CACHE)
        .then(cache => {
          console.log('SW: Caching critical assets');
          return cache.addAll(CRITICAL_ASSETS);
        }),
      // Preload additional static assets in background
      caches.open(DYNAMIC_CACHE)
        .then(cache => {
          return cache.addAll(STATIC_ASSETS.slice(0, 5)); // Limit initial cache size
        })
    ])
    .then(() => {
      // Take control immediately for faster performance
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('SW: Activating service worker');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && 
                cacheName !== DYNAMIC_CACHE && 
                cacheName !== API_CACHE) {
              console.log('SW: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control of all clients
        return self.clients.claim();
      })
  );
});

// Fetch event - handle all network requests
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isAPIRequest(url)) {
    event.respondWith(networkFirst(request, API_CACHE));
  } else if (isImageRequest(url)) {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
  } else {
    event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE));
  }
});

// Strategy: Cache First (for static assets)
async function cacheFirst(request, cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const networkResponse = await fetch(request);
    
    if (networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('SW: Cache first strategy failed:', error);
    return getOfflineFallback(request);
  }
}

// Strategy: Network First (for API requests)
async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('SW: Network first failed, trying cache:', error);
    
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return getOfflineFallback(request);
  }
}

// Strategy: Stale While Revalidate (for dynamic content)
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  // Fetch fresh version in background
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(error => {
      console.log('SW: Background fetch failed:', error);
    });
  
  // Return cached version immediately, or wait for network
  return cachedResponse || fetchPromise || getOfflineFallback(request);
}

// Helper functions
function isStaticAsset(url) {
  return url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|gif|svg|ico)$/) ||
         url.pathname === '/' ||
         url.pathname === '/index.html';
}

function isAPIRequest(url) {
  return url.pathname.startsWith('/api/') ||
         url.hostname === 'api.commodityprice.com' ||
         url.hostname === 'www.alphavantage.co' ||
         url.hostname === 'financialmodelingprep.com' ||
         url.hostname.includes('supabase.co');
}

function isImageRequest(url) {
  return url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/);
}

function getOfflineFallback(request) {
  const url = new URL(request.url);
  
  if (isImageRequest(url)) {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200"><rect width="300" height="200" fill="#f3f4f6"/><text x="150" y="100" text-anchor="middle" fill="#9ca3af">Image unavailable</text></svg>',
      { 
        headers: { 'Content-Type': 'image/svg+xml' }
      }
    );
  }
  
  if (url.pathname.startsWith('/api/')) {
    return new Response(
      JSON.stringify({ 
        error: 'Offline', 
        message: 'This data is not available offline' 
      }),
      { 
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // For page requests, return cached index.html
  return caches.match('/index.html');
}

// Background sync for failed requests
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Retry failed API requests when connection is restored
  console.log('SW: Performing background sync');
  
  // Implementation would depend on your specific needs
  // e.g., retry queued analytics events, sync user data, etc.
}

// Push notifications (for future use)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icon.png',
    badge: '/badge-72.png',
    tag: data.tag || 'default',
    requireInteraction: true,
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icon.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});

// Periodic background sync (for future use)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'market-data-sync') {
    event.waitUntil(syncMarketData());
  }
});

async function syncMarketData() {
  // Sync critical market data in background
  console.log('SW: Syncing market data in background');
}

// Cache management
self.addEventListener('message', event => {
  if (event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(updateCache());
  } else if (event.data.type === 'CACHE_CLEAR') {
    event.waitUntil(clearCache());
  }
});

async function updateCache() {
  const cache = await caches.open(STATIC_CACHE);
  await cache.addAll(STATIC_ASSETS);
}

async function clearCache() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(cacheName => caches.delete(cacheName))
  );
}