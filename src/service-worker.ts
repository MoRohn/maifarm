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
  id: string;
  type: 'create-farm' | 'update-farm' | 'delete-farm' | 'agent-action' | 'pause-farm' | 'resume-farm';
  data: any;
  timestamp: number;
}

// Track visibility state
let isAppVisible = true;
const activeFarms: Set<string> = new Set();

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
        id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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
  
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    
    request.onsuccess = async () => {
      const allData: SyncData[] = request.result;
      
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
      resolve();
    };
    
    request.onerror = () => reject(request.error);
  });
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
    case 'pause-farm':
      return `${baseUrl}/api/farms/pause`;
    case 'resume-farm':
      return `${baseUrl}/api/farms/resume`;
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
    case 'pause-farm':
    case 'resume-farm':
      return 'POST';
  }
}

// IndexedDB helper
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('maifarm-offline', 2);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // Create sync queue store
      if (!db.objectStoreNames.contains(SYNC_QUEUE)) {
        db.createObjectStore(SYNC_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
      
      // Create farm preferences store
      if (!db.objectStoreNames.contains('farm-preferences')) {
        db.createObjectStore('farm-preferences', { keyPath: 'farmId' });
      }
      
      // Create paused farms store
      if (!db.objectStoreNames.contains('paused-farms')) {
        db.createObjectStore('paused-farms', { keyPath: 'farmId' });
      }
    };
  });
}

// Skip waiting and claim clients
self.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Handle visibility change messages from the main app
  if (event.data && event.data.type === 'VISIBILITY_CHANGE') {
    isAppVisible = event.data.visible;
    
    if (!isAppVisible) {
      // App is going to background, handle auto-pause
      await handleAppBackgrounded();
    } else {
      // App is coming to foreground, handle auto-resume
      await handleAppForegrounded();
    }
  }
  
  // Track active farms
  if (event.data && event.data.type === 'FARM_STATUS_UPDATE') {
    const { farmId, status, autoPauseOnClose } = event.data;
    
    if (status === 'active' || status === 'active') {
      activeFarms.add(farmId);
      // Store auto-pause preference for this farm
      await storeFarmPreference(farmId, { autoPauseOnClose });
    } else if (status === 'paused' || status === 'completed' || status === 'failed') {
      activeFarms.delete(farmId);
    }
  }
  
  // Update iOS indicator
  if (event.data && event.data.type === 'UPDATE_BACKGROUND_INDICATOR') {
    await updateBackgroundIndicator();
  }
});

// Helper functions for auto-pause functionality
async function handleAppBackgrounded(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('farm-preferences', 'readonly');
  const store = tx.objectStore('farm-preferences');
  
  for (const farmId of activeFarms) {
    const request = store.get(farmId);
    const preference = await new Promise<any>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    
    // Check if auto-pause is enabled for this farm
    if (preference?.autoPauseOnClose !== false) {
      // Default is true, so pause unless explicitly set to false
      await pauseFarm(farmId);
    }
  }
  
  // Update background indicator for iOS
  await updateBackgroundIndicator();
}

async function handleAppForegrounded(): Promise<void> {
  // Get farms that were paused when app went to background
  const db = await openDB();
  const tx = db.transaction('paused-farms', 'readonly');
  const store = tx.objectStore('paused-farms');
  
  const request = store.getAll();
  const pausedFarms = await new Promise<any[]>((resolve) => {
    request.onsuccess = () => resolve(request.result || []);
  });
  
  // Resume farms that were auto-paused
  for (const farm of pausedFarms) {
    if (farm.autoPaused) {
      await resumeFarm(farm.farmId);
    }
  }
  
  // Clear the paused farms list
  const clearTx = db.transaction('paused-farms', 'readwrite');
  const clearStore = clearTx.objectStore('paused-farms');
  clearStore.clear();
}

async function pauseFarm(farmId: string): Promise<void> {
  try {
    // Send pause command to all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'FARM_PAUSE',
        farmId,
        autoPaused: true,
      });
    });
    
    // Store that this farm was auto-paused
    const db = await openDB();
    const tx = db.transaction('paused-farms', 'readwrite');
    const store = tx.objectStore('paused-farms');
    await store.put({ farmId, autoPaused: true, timestamp: Date.now() });
    
    // Queue sync action if offline
    await queueSyncData({
      id: `pause_${farmId}_${Date.now()}`,
      type: 'pause-farm',
      data: { farmId },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to pause farm:', error);
  }
}

async function resumeFarm(farmId: string): Promise<void> {
  try {
    // Send resume command to all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'FARM_RESUME',
        farmId,
        autoResumed: true,
      });
    });
    
    // Queue sync action if offline
    await queueSyncData({
      id: `resume_${farmId}_${Date.now()}`,
      type: 'resume-farm',
      data: { farmId },
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Failed to resume farm:', error);
  }
}

async function storeFarmPreference(farmId: string, preference: any): Promise<void> {
  const db = await openDB();
  const tx = db.transaction('farm-preferences', 'readwrite');
  const store = tx.objectStore('farm-preferences');
  await store.put({ ...preference, farmId });
}

async function updateBackgroundIndicator(): Promise<void> {
  // Check if any farms are running in background
  const hasBackgroundFarms = activeFarms.size > 0 && !isAppVisible;
  
  // Send message to update iOS toolbar indicator
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'UPDATE_IOS_INDICATOR',
      showIndicator: hasBackgroundFarms,
      farmCount: activeFarms.size,
    });
  });
}

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