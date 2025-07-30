/* eslint-env serviceworker */

const CACHE_NAME = 'maifarm-v2-cache-v1';
const DYNAMIC_CACHE_NAME = 'maifarm-v2-dynamic-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/assets/maifarm_logo.svg',
  '/assets/maifarm_logo_128.png',
  '/assets/maifarm_logo_256.png',
  '/assets/maifarm_logo_512.png'
];

// API routes that should use network-first strategy
const NETWORK_FIRST_ROUTES = [
  '/api/auth',
  '/api/farms/active',
  '/api/agents/status',
  '/api/analytics/realtime'
];

// API routes that can use cache-first strategy
const CACHE_FIRST_ROUTES = [
  '/api/settings',
  '/api/templates',
  '/api/farms/historical'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              return cacheName.startsWith('maifarm-v2-') && 
                     cacheName !== CACHE_NAME && 
                     cacheName !== DYNAMIC_CACHE_NAME;
            })
            .map((cacheName) => {
              console.log('Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip external requests
  if (!url.href.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Network-first strategy for dynamic content
  if (NETWORK_FIRST_ROUTES.some(route => path.startsWith(route))) {
    return networkFirst(request);
  }

  // Cache-first strategy for static content
  if (CACHE_FIRST_ROUTES.some(route => path.startsWith(route))) {
    return cacheFirst(request);
  }

  // For all other requests, try cache then network
  return cacheFirst(request);
}

// Cache-first strategy
async function cacheFirst(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      // Update cache in background
      fetchAndCache(request, DYNAMIC_CACHE_NAME);
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('Cache-first fetch failed:', error);
    
    // Try to return offline page for navigation requests
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return cache.match(OFFLINE_URL) || new Response('Offline', { status: 503 });
    }
    
    return new Response('Network error', { status: 503 });
  }
}

// Network-first strategy
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('Network-first fetch failed:', error);
    
    // Fall back to cache
    const cache = await caches.open(DYNAMIC_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return offline response for navigation requests
    if (request.mode === 'navigate') {
      const staticCache = await caches.open(CACHE_NAME);
      return staticCache.match(OFFLINE_URL) || new Response('Offline', { status: 503 });
    }

    return new Response('Network error', { status: 503 });
  }
}

// Fetch and cache in background
async function fetchAndCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response);
    }
  } catch (error) {
    console.error('Background fetch failed:', error);
  }
}

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    const urlsToCache = event.data.payload || [];
    event.waitUntil(
      caches.open(DYNAMIC_CACHE_NAME)
        .then((cache) => cache.addAll(urlsToCache))
    );
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter(name => name.startsWith('maifarm-v2-dynamic'))
              .map(name => caches.delete(name))
          );
        })
    );
  }
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-farms') {
    event.waitUntil(syncFarms());
  }
});

async function syncFarms() {
  try {
    // Get pending operations from IndexedDB
    const db = await openDB();
    const tx = db.transaction('pending_operations', 'readonly');
    const store = tx.objectStore('pending_operations');
    const operations = await store.getAll();

    // Process each operation
    for (const op of operations) {
      try {
        const response = await fetch(op.url, {
          method: op.method,
          headers: op.headers,
          body: op.body
        });

        if (response.ok) {
          // Remove from pending operations
          const deleteTx = db.transaction('pending_operations', 'readwrite');
          await deleteTx.objectStore('pending_operations').delete(op.id);
        }
      } catch (error) {
        console.error('Sync operation failed:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Simple IndexedDB wrapper
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maifarm-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending_operations')) {
        db.createObjectStore('pending_operations', { keyPath: 'id' });
      }
    };
  });
}

// Periodic background sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-farms') {
    event.waitUntil(updateFarmsInBackground());
  }
});

async function updateFarmsInBackground() {
  try {
    // Fetch latest farm data
    const response = await fetch('/api/farms');
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      await cache.put('/api/farms', response);
      
      // Notify clients of update
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({
          type: 'FARMS_UPDATED',
          timestamp: new Date().toISOString()
        });
      });
    }
  } catch (error) {
    console.error('Background update failed:', error);
  }
}