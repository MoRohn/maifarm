/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

declare let self: ServiceWorkerGlobalScope;
export {};

// Override event listener types to use proper service worker events
interface ServiceWorkerGlobalScope {
  caches: CacheStorage;
  clients: Clients;
  registration: ServiceWorkerRegistration;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'push', listener: (event: PushEvent) => void): void;
  addEventListener(type: 'sync', listener: (event: ExtendableEvent & { tag: string }) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: NotificationEvent) => void): void;
}

interface NotificationEvent extends ExtendableEvent {
  readonly notification: Notification;
  readonly action: string;
}

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

const CACHE_NAME = 'maifarm-v2-cache-v1';
const OFFLINE_CACHE_NAME = 'maifarm-v2-offline-v1';
const DYNAMIC_CACHE_NAME = 'maifarm-v2-dynamic-v1';

// URLs to cache for offline use
const STATIC_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon-light.svg',
  '/favicon-dark.svg',
  '/maifarm-logo-light-bkgd.svg',
  '/maifarm-logo-dark-bkgd.svg',
];

// API endpoints that can work offline
const OFFLINE_API_PATTERNS = [
  /\/api\/farms$/,
  /\/api\/agents$/,
  /\/api\/yaml\/templates$/,
  /\/api\/analytics\/cached$/,
];

// Install event - cache static assets
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_URLS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== OFFLINE_CACHE_NAME && 
              cacheName !== DYNAMIC_CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static assets with cache-first strategy
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Handle everything else with network-first strategy
  event.respondWith(networkFirst(request));
});

// Handle background sync for failed requests
self.addEventListener('sync', (event: SyncEvent) => {
  if (event.tag === 'sync-farms') {
    event.waitUntil(syncFarms());
  } else if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalytics());
  }
});

// Handle push notifications
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  const data = event.data.json();
  const options: NotificationOptions = {
    body: data.body,
    icon: '/maifarm-icon-light-bkgd.svg',
    badge: '/favicon-light.svg',
    data: {
      dateOfArrival: Date.now(),
      primaryKey: data.id,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      (self as any).clients.openWindow('/farms/' + event.notification.data.primaryKey)
    );
  }
});

// Helper functions
async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  
  // Check if this API endpoint supports offline mode
  const supportsOffline = OFFLINE_API_PATTERNS.some(pattern => 
    pattern.test(url.pathname)
  );

  if (!supportsOffline) {
    // Network only for non-offline APIs
    try {
      return await fetch(request);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Network error', offline: true }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Network first, fallback to cache for offline APIs
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    return new Response(
      JSON.stringify({ error: 'Offline', cached: false }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('Offline', { status: 503 });
  }
}

function isStaticAsset(pathname: string): boolean {
  return !!pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff|woff2|ttf|eot)$/);
}

async function syncFarms(): Promise<void> {
  // Get pending farm operations from IndexedDB
  const pendingOps = await getPendingOperations('farms');
  
  for (const op of pendingOps) {
    try {
      const response = await fetch(op.url, {
        method: op.method,
        headers: op.headers,
        body: op.body,
      });
      
      if (response.ok) {
        await removePendingOperation(op.id);
      }
    } catch (error) {
      console.error('[Service Worker] Sync failed for operation:', op.id);
    }
  }
}

async function syncAnalytics(): Promise<void> {
  // Similar to syncFarms but for analytics data
  const pendingOps = await getPendingOperations('analytics');
  
  for (const op of pendingOps) {
    try {
      const response = await fetch(op.url, {
        method: op.method,
        headers: op.headers,
        body: op.body,
      });
      
      if (response.ok) {
        await removePendingOperation(op.id);
      }
    } catch (error) {
      console.error('[Service Worker] Analytics sync failed:', op.id);
    }
  }
}

// IndexedDB helpers (simplified)
async function getPendingOperations(type: string): Promise<any[]> {
  // In a real implementation, this would query IndexedDB
  return [];
}

async function removePendingOperation(id: string): Promise<void> {
  // In a real implementation, this would remove from IndexedDB
}
