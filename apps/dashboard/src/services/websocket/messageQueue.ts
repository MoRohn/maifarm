/**
 * Client-side message queue for offline scenarios
 * Persists messages to IndexedDB for reliability
 */

interface QueuedMessage {
  id: string;
  event: string;
  data: any;
  callback?: (ack: any) => void;
  timestamp: number;
  attempts: number;
  priority: 'high' | 'normal' | 'low';
}

export class ClientMessageQueue {
  private queue: QueuedMessage[] = [];
  private maxSize: number = 100;
  private db: IDBDatabase | null = null;
  private dbName = 'websocket_queue';
  private storeName = 'messages';
  private clientId: string;
  
  constructor(clientId: string = 'default') {
    this.clientId = clientId;
    this.initializeDB();
    this.loadPersistedMessages();
  }
  
  /**
   * Initialize IndexedDB for persistence
   */
  private async initializeDB(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn('[MessageQueue] IndexedDB not available, using memory only');
      return;
    }
    
    try {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => {
        console.error('[MessageQueue] Failed to open IndexedDB');
      };
      
      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('[MessageQueue] IndexedDB initialized');
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('clientId', 'clientId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    } catch (error) {
      console.error('[MessageQueue] Failed to initialize IndexedDB:', error);
    }
  }
  
  /**
   * Load persisted messages from IndexedDB
   */
  private async loadPersistedMessages(): Promise<void> {
    if (!this.db) return;
    
    try {
      await new Promise((resolve) => {
        const checkDB = () => {
          if (this.db) {
            resolve(true);
          } else {
            setTimeout(checkDB, 100);
          }
        };
        checkDB();
      });
      
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('clientId');
      const request = index.getAll(this.clientId);
      
      request.onsuccess = (event) => {
        const messages = (event.target as IDBRequest).result;
        
        // Filter out expired messages (older than 1 hour)
        const cutoff = Date.now() - 3600000;
        const validMessages = messages.filter((msg: QueuedMessage) => msg.timestamp > cutoff);
        
        if (validMessages.length > 0) {
          console.log(`[MessageQueue] Loaded ${validMessages.length} persisted messages`);
          this.queue = validMessages;
          
          // Clean up expired messages
          this.cleanupExpiredMessages();
        }
      };
    } catch (error) {
      console.error('[MessageQueue] Failed to load persisted messages:', error);
    }
  }
  
  /**
   * Enqueue a message
   */
  enqueue(event: string, data: any, callback?: (ack: any) => void): string {
    const messageId = this.generateMessageId();
    
    const message: QueuedMessage = {
      id: messageId,
      event,
      data,
      callback,
      timestamp: Date.now(),
      attempts: 0,
      priority: this.determinePriority(event)
    };
    
    // Add to queue based on priority
    if (message.priority === 'high') {
      this.queue.unshift(message);
    } else {
      this.queue.push(message);
    }
    
    // Enforce max size
    if (this.queue.length > this.maxSize) {
      const removed = this.queue.pop();
      console.warn(`[MessageQueue] Queue full, dropping message: ${removed?.event}`);
    }
    
    // Persist to IndexedDB
    this.persistMessage(message);
    
    return messageId;
  }
  
  /**
   * Dequeue a message
   */
  dequeue(): QueuedMessage | undefined {
    const message = this.queue.shift();
    
    if (message) {
      // Remove from persistent storage
      this.removePersistedMessage(message.id);
    }
    
    return message;
  }
  
  /**
   * Flush all messages (returns and clears queue)
   */
  flush(): QueuedMessage[] {
    const messages = [...this.queue];
    this.queue = [];
    
    // Clear persistent storage
    this.clearPersistedMessages();
    
    return messages;
  }
  
  /**
   * Get queue size
   */
  size(): number {
    return this.queue.length;
  }
  
  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
    this.clearPersistedMessages();
  }
  
  /**
   * Check if persistence is available
   */
  isPersisted(): boolean {
    return this.db !== null;
  }
  
  /**
   * Persist a message to IndexedDB
   */
  private async persistMessage(message: QueuedMessage): Promise<void> {
    if (!this.db) return;
    
    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Don't persist callbacks (they can't be serialized)
      const persistable = { ...message, callback: undefined, clientId: this.clientId };
      store.put(persistable);
    } catch (error) {
      console.error('[MessageQueue] Failed to persist message:', error);
    }
  }
  
  /**
   * Remove a persisted message
   */
  private async removePersistedMessage(messageId: string): Promise<void> {
    if (!this.db) return;
    
    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      store.delete(messageId);
    } catch (error) {
      console.error('[MessageQueue] Failed to remove persisted message:', error);
    }
  }
  
  /**
   * Clear all persisted messages for this client
   */
  private async clearPersistedMessages(): Promise<void> {
    if (!this.db) return;
    
    try {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('clientId');
      const request = index.getAllKeys(this.clientId);
      
      request.onsuccess = (event) => {
        const keys = (event.target as IDBRequest).result;
        keys.forEach(key => store.delete(key));
      };
    } catch (error) {
      console.error('[MessageQueue] Failed to clear persisted messages:', error);
    }
  }
  
  /**
   * Clean up expired messages
   */
  private async cleanupExpiredMessages(): Promise<void> {
    if (!this.db) return;
    
    try {
      const cutoff = Date.now() - 3600000; // 1 hour
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    } catch (error) {
      console.error('[MessageQueue] Failed to cleanup expired messages:', error);
    }
  }
  
  /**
   * Determine message priority based on event type
   */
  private determinePriority(event: string): 'high' | 'normal' | 'low' {
    // High priority events
    if (event.includes('error') || event.includes('critical') || event.includes('urgent')) {
      return 'high';
    }
    
    // Low priority events
    if (event.includes('metric') || event.includes('heartbeat') || event.includes('ping')) {
      return 'low';
    }
    
    // Default to normal
    return 'normal';
  }
  
  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${this.clientId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export { QueuedMessage };