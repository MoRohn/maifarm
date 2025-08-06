/* eslint-env serviceworker */

const CACHE_NAME = 'maifarm-cache-v2';
const DYNAMIC_CACHE_NAME = 'maifarm-dynamic-v2';
const OFFLINE_URL = '/offline.html';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_DYNAMIC_CACHE_SIZE = 50; // Maximum number of dynamic responses to cache

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon-light.svg',
  '/favicon-dark.svg',
  '/apple-touch-icon.png'
];

// API routes that should use network-first strategy
const NETWORK_FIRST_ROUTES = [
  '/api/auth',
  '/api/farms/active',
  '/api/agents/status',
  '/api/analytics/realtime',
  '/api/ha/status',
  '/api/ha/nodes',
  '/api/sync',
  '/api/offline/sync'
];

// API routes that can use cache-first strategy
const CACHE_FIRST_ROUTES = [
  '/api/settings',
  '/api/templates',
  '/api/farms/historical',
  '/api/backups',
  '/api/analytics/historical'
];

// Routes that should never be cached
const NO_CACHE_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/ws',
  '/api/ws'
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
              return cacheName.startsWith('maifarm-') && 
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

  // Skip WebSocket requests
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }

  // Skip external requests
  if (!url.href.startsWith(self.location.origin)) {
    return;
  }

  // Handle non-GET requests (POST, PUT, DELETE)
  if (request.method !== 'GET') {
    event.respondWith(handleNonGetRequest(request));
    return;
  }

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Never cache these routes
  if (NO_CACHE_ROUTES.some(route => path.startsWith(route))) {
    return fetch(request);
  }

  // Network-first strategy for dynamic content
  if (NETWORK_FIRST_ROUTES.some(route => path.startsWith(route))) {
    return networkFirst(request);
  }

  // Cache-first strategy for static content
  if (CACHE_FIRST_ROUTES.some(route => path.startsWith(route))) {
    return cacheFirst(request);
  }

  // For all other requests, use stale-while-revalidate
  return staleWhileRevalidate(request);
}

// Handle non-GET requests (POST, PUT, DELETE)
async function handleNonGetRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Don't handle auth requests offline
  if (NO_CACHE_ROUTES.some(route => path.startsWith(route))) {
    return fetch(request);
  }

  try {
    // Try to make the request
    const response = await fetch(request.clone());
    return response;
  } catch (error) {
    // If offline, queue the request for later
    if (!navigator.onLine && path.startsWith('/api/')) {
      return queueRequest(request);
    }
    throw error;
  }
}

// Queue request for background sync
async function queueRequest(request) {
  const body = await request.clone().text();
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const operation = {
    id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    url: request.url,
    method: request.method,
    headers: headers,
    body: body,
    timestamp: Date.now()
  };

  // Store in IndexedDB
  const db = await openDB();
  const tx = db.transaction('pending_operations', 'readwrite');
  await tx.objectStore('pending_operations').put(operation);

  // Register sync
  if ('sync' in self.registration) {
    await self.registration.sync.register('sync-farms');
  }

  // Return optimistic response
  return new Response(JSON.stringify({
    queued: true,
    operationId: operation.id,
    message: 'Operation queued for sync when online'
  }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
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
              .filter(name => name.startsWith('maifarm-dynamic'))
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

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  // Return cached response immediately if available
  const fetchPromise = fetch(request).then(async (networkResponse) => {
    if (networkResponse.ok) {
      // Update cache in background
      cache.put(request, networkResponse.clone());
      
      // Clean up old cache entries if needed
      await trimCache(DYNAMIC_CACHE_NAME, MAX_DYNAMIC_CACHE_SIZE);
    }
    return networkResponse;
  }).catch((error) => {
    console.error('Background fetch failed:', error);
    return cachedResponse || new Response('Network error', { status: 503 });
  });
  
  return cachedResponse || fetchPromise;
}

// Trim cache to maintain size limits
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // Sort by request time (oldest first)
    const sortedKeys = keys.sort((a, b) => {
      // In production, you'd want to store timestamps with cache entries
      return 0; // Simplified for now
    });
    
    // Delete oldest entries
    const keysToDelete = sortedKeys.slice(0, keys.length - maxItems);
    await Promise.all(keysToDelete.map(key => cache.delete(key)));
  }
}

// Enhanced sync with retry logic
async function syncFarms() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending_operations', 'readonly');
    const store = tx.objectStore('pending_operations');
    const operations = await store.getAll();

    console.log(`[Sync] Found ${operations.length} pending operations`);

    for (const op of operations) {
      try {
        // Add authentication token if available
        const headers = { ...op.headers };
        if (!headers['Authorization']) {
          // Try to get token from clients
          const clients = await self.clients.matchAll();
          if (clients.length > 0) {
            const client = clients[0];
            const token = await getTokenFromClient(client);
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
          }
        }

        const response = await fetch(op.url, {
          method: op.method,
          headers: headers,
          body: op.body
        });

        if (response.ok) {
          // Remove from pending operations
          const deleteTx = db.transaction('pending_operations', 'readwrite');
          await deleteTx.objectStore('pending_operations').delete(op.id);
          
          // Notify clients of successful sync
          await notifyClients('sync:success', {
            operationId: op.id,
            url: op.url,
            method: op.method
          });
        } else if (response.status === 409) {
          // Conflict - notify client
          await notifyClients('sync:conflict', {
            operationId: op.id,
            url: op.url,
            conflict: await response.json()
          });
        }
      } catch (error) {
        console.error(`[Sync] Operation ${op.id} failed:`, error);
        
        // Update retry count
        op.retryCount = (op.retryCount || 0) + 1;
        
        if (op.retryCount >= 3) {
          // Move to dead letter queue
          await notifyClients('sync:failed', {
            operationId: op.id,
            url: op.url,
            error: error.message
          });
          
          // Remove from pending
          const deleteTx = db.transaction('pending_operations', 'readwrite');
          await deleteTx.objectStore('pending_operations').delete(op.id);
        } else {
          // Update retry count in DB
          const updateTx = db.transaction('pending_operations', 'readwrite');
          await updateTx.objectStore('pending_operations').put(op);
        }
      }
    }

    console.log('[Sync] Sync completed');
    await notifyClients('sync:complete', {
      synced: operations.length
    });
  } catch (error) {
    console.error('[Sync] Background sync failed:', error);
    await notifyClients('sync:error', {
      error: error.message
    });
  }
}

// Get token from client
async function getTokenFromClient(client) {
  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data.token);
    };
    
    client.postMessage({ type: 'GET_TOKEN' }, [messageChannel.port2]);
    
    // Timeout after 5 seconds
    setTimeout(() => resolve(null), 5000);
  });
}

// Notify all clients
async function notifyClients(type, data) {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: type,
      data: data,
      timestamp: new Date().toISOString()
    });
  });
}

// Simple IndexedDB wrapper
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maifarm-offline', 2);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Pending operations store
      if (!db.objectStoreNames.contains('pending_operations')) {
        const store = db.createObjectStore('pending_operations', { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
      }
      
      // Cached data store
      if (!db.objectStoreNames.contains('cached_data')) {
        const store = db.createObjectStore('cached_data', { keyPath: 'key' });
        store.createIndex('expiry', 'expiry');
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