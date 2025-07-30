/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Precache all static assets
precacheAndRoute(self.__WB_MANIFEST);

// Cache strategies
const CACHE_NAMES = {
  static: 'maifarm-static-v1',
  dynamic: 'maifarm-dynamic-v1',
  api: 'maifarm-api-v1',
  farms: 'maifarm-farms-v1',
  agents: 'maifarm-agents-v1',
};

// Cache static assets (images, fonts, etc.)
registerRoute(
  ({ request }) => 
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style',
  new CacheFirst({
    cacheName: CACHE_NAMES.static,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// Cache API calls with network-first strategy
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.api,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 5 * 60, // 5 minutes
      }),
    ],
  })
);

// Cache farm data with stale-while-revalidate
registerRoute(
  ({ url }) => url.pathname.includes('/farms'),
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.farms,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60, // 24 hours
      }),
    ],
  })
);

// Cache agent data
registerRoute(
  ({ url }) => url.pathname.includes('/agents'),
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.agents,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

// Background sync for offline actions
interface SyncData {
  type: 'create-farm' | 'update-farm' | 'delete-farm' | 'agent-action';
  data: any;
  timestamp: number;
}

const SYNC_QUEUE = 'maifarm-sync-queue';

// Queue offline actions
self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'POST' && event.request.method !== 'PUT' && event.request.method !== 'DELETE') {
    return;
  }

  const isApiCall = event.request.url.includes('/api/');
  if (!isApiCall) return;

  event.respondWith(
    fetch(event.request.clone()).catch(async () => {
      // Queue the request for later sync
      const body = await event.request.clone().text();
      const syncData: SyncData = {
        type: determineSyncType(event.request),
        data: JSON.parse(body),
        timestamp: Date.now(),
      };

      // Store in IndexedDB for background sync
      await queueSyncData(syncData);

      // Return a synthetic response
      return new Response(
        JSON.stringify({
          success: true,
          offline: true,
          message: 'Action queued for sync when online',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 202,
        }
      );
    })
  );
});

// Background sync handler
self.addEventListener('sync', async (event: any) => {
  if (event.tag === 'maifarm-sync') {
    event.waitUntil(syncOfflineData());
  }
});

// Helper functions
function determineSyncType(request: Request): SyncData['type'] {
  const url = new URL(request.url);
  if (url.pathname.includes('/farms')) {
    if (request.method === 'POST') return 'create-farm';
    if (request.method === 'PUT') return 'update-farm';
    if (request.method === 'DELETE') return 'delete-farm';
  }
  return 'agent-action';
}

async function queueSyncData(data: SyncData): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE, 'readwrite');
  await tx.objectStore(SYNC_QUEUE).add(data);
}

async function syncOfflineData(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE, 'readonly');
  const store = tx.objectStore(SYNC_QUEUE);
  const allData = await store.getAll();

  for (const syncData of allData) {
    try {
      // Attempt to sync each queued action
      await syncAction(syncData);
      
      // Remove from queue on success
      const deleteTx = db.transaction(SYNC_QUEUE, 'readwrite');
      await deleteTx.objectStore(SYNC_QUEUE).delete(syncData.id);
    } catch (error) {
      console.error('Failed to sync action:', error);
    }
  }
}

async function syncAction(syncData: SyncData): Promise<void> {
  const endpoint = getEndpointForSyncType(syncData.type);
  const method = getMethodForSyncType(syncData.type);
  
  await fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Timestamp': syncData.timestamp.toString(),
    },
    body: JSON.stringify(syncData.data),
  });
}

function getEndpointForSyncType(type: SyncData['type']): string {
  const baseUrl = self.location.origin;
  switch (type) {
    case 'create-farm':
    case 'update-farm':
    case 'delete-farm':
      return `${baseUrl}/api/farms`;
    case 'agent-action':
      return `${baseUrl}/api/agents/action`;
  }
}

function getMethodForSyncType(type: SyncData['type']): string {
  switch (type) {
    case 'create-farm':
      return 'POST';
    case 'update-farm':
      return 'PUT';
    case 'delete-farm':
      return 'DELETE';
    case 'agent-action':
      return 'POST';
  }
}

// IndexedDB helper
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maifarm-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        db.createObjectStore(SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

// Skip waiting and claim clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => !Object.values(CACHE_NAMES).includes(name))
          .map((name) => caches.delete(name))
      );
      
      // Take control of all clients
      await self.clients.claim();
    })()
  );
});