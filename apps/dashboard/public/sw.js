// MaiFarm V2 Service Worker
const CACHE_NAME = 'maifarm-v2-cache-v1';
const API_CACHE = 'maifarm-api-cache-v1';
const OFFLINE_URL = '/offline.html';

// Files to cache for offline use
const urlsToCache = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/favicon.ico',
  '/assets/maifarm_logo.svg',
  '/static/css/main.css',
  '/static/js/main.js'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching essential files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    // WebSocket connections can't be cached
    return;
  }

  // Handle other requests with cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }

        return fetch(request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(request, responseToCache);
            });

          return response;
        });
      })
      .catch(() => {
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});

// Handle API requests with network-first strategy
async function handleApiRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(API_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Add header to indicate cached response
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-Cache-Status', 'HIT');
      
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: headers
      });
    }
    
    // Return error response
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'No cached data available'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Background sync for queued operations
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-farms') {
    event.waitUntil(syncFarmData());
  } else if (event.tag === 'sync-logs') {
    event.waitUntil(syncAuditLogs());
  }
});

// Sync farm data when back online
async function syncFarmData() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending-operations', 'readonly');
    const operations = await tx.objectStore('pending-operations').getAll();

    for (const operation of operations) {
      try {
        const response = await fetch(operation.url, {
          method: operation.method,
          headers: operation.headers,
          body: operation.body
        });

        if (response.ok) {
          // Remove from pending operations
          const deleteTx = db.transaction('pending-operations', 'readwrite');
          await deleteTx.objectStore('pending-operations').delete(operation.id);
        }
      } catch (error) {
        console.error('[SW] Failed to sync operation:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// Sync audit logs when back online
async function syncAuditLogs() {
  try {
    const db = await openDB();
    const tx = db.transaction('pending-logs', 'readonly');
    const logs = await tx.objectStore('pending-logs').getAll();

    if (logs.length > 0) {
      const response = await fetch('/api/audit/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs })
      });

      if (response.ok) {
        // Clear pending logs
        const deleteTx = db.transaction('pending-logs', 'readwrite');
        await deleteTx.objectStore('pending-logs').clear();
      }
    }
  } catch (error) {
    console.error('[SW] Failed to sync audit logs:', error);
  }
}

// Open IndexedDB
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maifarm-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('pending-operations')) {
        db.createObjectStore('pending-operations', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('pending-logs')) {
        db.createObjectStore('pending-logs', { keyPath: 'id', autoIncrement: true });
      }
      
      if (!db.objectStoreNames.contains('cached-data')) {
        db.createObjectStore('cached-data', { keyPath: 'key' });
      }
    };
  });
}

// Message handling
self.addEventListener('message', (event) => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'QUEUE_OPERATION') {
    queueOperation(event.data.operation);
  } else if (event.data.type === 'CACHE_DATA') {
    cacheData(event.data.key, event.data.data);
  }
});

// Queue operation for later sync
async function queueOperation(operation) {
  try {
    const db = await openDB();
    const tx = db.transaction('pending-operations', 'readwrite');
    await tx.objectStore('pending-operations').add({
      ...operation,
      timestamp: new Date().toISOString()
    });
    
    // Register sync event
    await self.registration.sync.register('sync-farms');
  } catch (error) {
    console.error('[SW] Failed to queue operation:', error);
  }
}

// Cache data for offline access
async function cacheData(key, data) {
  try {
    const db = await openDB();
    const tx = db.transaction('cached-data', 'readwrite');
    await tx.objectStore('cached-data').put({
      key,
      data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[SW] Failed to cache data:', error);
  }
}

// Periodic background sync
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-farms') {
    event.waitUntil(updateFarmData());
  }
});

// Update farm data periodically
async function updateFarmData() {
  try {
    const response = await fetch('/api/farms/active');
    if (response.ok) {
      const data = await response.json();
      await cacheData('active-farms', data);
    }
  } catch (error) {
    console.error('[SW] Failed to update farm data:', error);
  }
}

// Push notifications
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification from MaiFarm',
    icon: '/assets/maifarm_logo_icon.png',
    badge: '/assets/maifarm_logo_icon.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  event.waitUntil(
    self.registration.showNotification('MaiFarm Alert', options)
  );
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/')
  );
});