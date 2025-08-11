import { Socket } from 'socket.io';
import { LRUCache } from 'lru-cache';

/**
 * WebSocket Performance Optimizer
 * Implements connection pooling, message batching, and caching
 */
export class WebSocketPerformanceOptimizer {
  private messageQueue: Map<string, Array<{ event: string; data: any }>> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly BATCH_INTERVAL = 100; // Batch messages every 100ms
  private readonly MAX_BATCH_SIZE = 50;
  
  // LRU cache for frequently accessed data
  private cache: LRUCache<string, any>;
  
  // Connection pool management
  private connectionPool: Map<string, Socket[]> = new Map();
  private readonly MAX_CONNECTIONS_PER_CLIENT = 3;
  
  // Compression settings
  private compressionThreshold = 1024; // Compress messages larger than 1KB
  
  constructor() {
    this.cache = new LRUCache({
      max: 500,
      ttl: 1000 * 60 * 5, // 5 minute TTL
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });
  }

  /**
   * Batch messages to reduce network overhead
   */
  public queueMessage(socketId: string, event: string, data: any): void {
    if (!this.messageQueue.has(socketId)) {
      this.messageQueue.set(socketId, []);
    }
    
    const queue = this.messageQueue.get(socketId)!;
    queue.push({ event, data });
    
    // Send immediately if batch is full
    if (queue.length >= this.MAX_BATCH_SIZE) {
      this.flushMessages(socketId);
      return;
    }
    
    // Otherwise, schedule batch send
    if (!this.batchTimers.has(socketId)) {
      const timer = setTimeout(() => {
        this.flushMessages(socketId);
      }, this.BATCH_INTERVAL);
      
      this.batchTimers.set(socketId, timer);
    }
  }

  /**
   * Flush batched messages
   */
  private flushMessages(socketId: string): void {
    const queue = this.messageQueue.get(socketId);
    if (!queue || queue.length === 0) return;
    
    // Clear timer
    const timer = this.batchTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(socketId);
    }
    
    // Get socket from pool
    const socket = this.getSocketFromPool(socketId);
    if (!socket) {
      console.warn(`No socket found for ${socketId}, messages will be lost`);
      this.messageQueue.delete(socketId);
      return;
    }
    
    // Send batched message
    socket.emit('batch', {
      messages: queue,
      timestamp: Date.now()
    });
    
    // Clear queue
    this.messageQueue.delete(socketId);
  }

  /**
   * Manage connection pooling
   */
  public addToPool(clientId: string, socket: Socket): boolean {
    if (!this.connectionPool.has(clientId)) {
      this.connectionPool.set(clientId, []);
    }
    
    const pool = this.connectionPool.get(clientId)!;
    
    // Limit connections per client
    if (pool.length >= this.MAX_CONNECTIONS_PER_CLIENT) {
      // Replace oldest connection
      const oldSocket = pool.shift();
      oldSocket?.disconnect(true);
    }
    
    pool.push(socket);
    return true;
  }

  /**
   * Get socket from pool with load balancing
   */
  private getSocketFromPool(clientId: string): Socket | null {
    const pool = this.connectionPool.get(clientId);
    if (!pool || pool.length === 0) return null;
    
    // Simple round-robin load balancing
    const socket = pool[0];
    
    // Rotate pool for next request
    pool.push(pool.shift()!);
    
    return socket;
  }

  /**
   * Cache frequently accessed data
   */
  public getCached<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  public setCached(key: string, value: any): void {
    this.cache.set(key, value);
  }

  /**
   * Check if data should be compressed
   */
  public shouldCompress(data: any): boolean {
    const size = JSON.stringify(data).length;
    return size > this.compressionThreshold;
  }

  /**
   * Optimize broadcast operations
   */
  public optimizedBroadcast(
    room: string,
    event: string,
    data: any,
    io: any
  ): void {
    // Check cache first
    const cacheKey = `broadcast:${room}:${event}`;
    const cachedData = this.getCached(cacheKey);
    
    if (cachedData && JSON.stringify(cachedData) === JSON.stringify(data)) {
      // Data hasn't changed, skip broadcast
      return;
    }
    
    // Update cache
    this.setCached(cacheKey, data);
    
    // Compress if needed
    const payload = this.shouldCompress(data) ? this.compressData(data) : data;
    
    // Broadcast with compression flag
    io.to(room).emit(event, {
      data: payload,
      compressed: this.shouldCompress(data),
      timestamp: Date.now()
    });
  }

  /**
   * Simple compression using JSON minification
   */
  private compressData(data: any): string {
    // In production, use a proper compression library like pako
    return JSON.stringify(data);
  }

  /**
   * Clean up resources
   */
  public cleanup(socketId: string): void {
    // Clear message queue
    this.messageQueue.delete(socketId);
    
    // Clear batch timer
    const timer = this.batchTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(socketId);
    }
    
    // Remove from connection pool
    this.connectionPool.delete(socketId);
  }

  /**
   * Get performance metrics
   */
  public getMetrics(): {
    queuedMessages: number;
    activeConnections: number;
    cacheSize: number;
    cacheHitRate: number;
  } {
    let queuedMessages = 0;
    this.messageQueue.forEach(queue => {
      queuedMessages += queue.length;
    });
    
    let activeConnections = 0;
    this.connectionPool.forEach(pool => {
      activeConnections += pool.length;
    });
    
    return {
      queuedMessages,
      activeConnections,
      cacheSize: this.cache.size,
      cacheHitRate: this.cache.size > 0 ? 
        (this.cache as any).hits / ((this.cache as any).hits + (this.cache as any).misses) : 0
    };
  }

  /**
   * Implement backpressure handling
   */
  public handleBackpressure(socket: Socket): boolean {
    const socketId = socket.id;
    const queue = this.messageQueue.get(socketId);
    
    // If queue is too large, apply backpressure
    if (queue && queue.length > this.MAX_BATCH_SIZE * 2) {
      socket.emit('backpressure', {
        queueSize: queue.length,
        message: 'Server is experiencing high load, please slow down'
      });
      
      // Drop oldest messages if queue is critically full
      if (queue.length > this.MAX_BATCH_SIZE * 3) {
        const dropped = queue.splice(0, this.MAX_BATCH_SIZE);
        console.warn(`Dropped ${dropped.length} messages for ${socketId} due to backpressure`);
      }
      
      return true;
    }
    
    return false;
  }

  /**
   * Optimize memory usage by cleaning up stale data
   */
  public performGarbageCollection(): void {
    // Clean up disconnected sockets from pool
    this.connectionPool.forEach((pool, clientId) => {
      const activePool = pool.filter(socket => socket.connected);
      if (activePool.length !== pool.length) {
        this.connectionPool.set(clientId, activePool);
      }
      
      // Remove empty pools
      if (activePool.length === 0) {
        this.connectionPool.delete(clientId);
      }
    });
    
    // Clear old cache entries (handled by LRU)
    this.cache.purgeStale();
    
    // Log metrics for monitoring
    const metrics = this.getMetrics();
    console.log('[WebSocket Optimizer] GC completed:', metrics);
  }
}

// Singleton instance
export const wsOptimizer = new WebSocketPerformanceOptimizer();

// Run garbage collection periodically
setInterval(() => {
  wsOptimizer.performGarbageCollection();
}, 60000); // Every minute