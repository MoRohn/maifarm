/**
 * WebSocket Performance Optimizer
 * Implements compression, deduplication, batching, and intelligent routing
 */

import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { LRUCache } from 'lru-cache';
import { logger, LogCategory } from '../utils/logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface MessageBatch {
  messages: any[];
  timestamp: number;
  size: number;
}

interface MessageMetrics {
  sent: number;
  received: number;
  deduplicated: number;
  compressed: number;
  batched: number;
  bytesIn: number;
  bytesOut: number;
  bytesSaved: number;
}

interface CompressionResult {
  compressed: boolean;
  data: Buffer | any;
  originalSize: number;
  compressedSize?: number;
}

export class WebSocketOptimizer {
  private static instance: WebSocketOptimizer;

  // Message deduplication cache
  private messageCache: LRUCache<string, number>;

  // Message batching
  private messageBatches: Map<string, MessageBatch> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();

  // Metrics
  private metrics: MessageMetrics = {
    sent: 0,
    received: 0,
    deduplicated: 0,
    compressed: 0,
    batched: 0,
    bytesIn: 0,
    bytesOut: 0,
    bytesSaved: 0
  };

  // Configuration
  private readonly COMPRESSION_THRESHOLD = 1024; // Compress messages > 1KB
  private readonly BATCH_SIZE_LIMIT = 50; // Max messages per batch
  private readonly BATCH_TIME_WINDOW = 100; // ms to wait for batching
  private readonly DEDUP_WINDOW = 5000; // 5 seconds dedup window
  private readonly CACHE_SIZE = 10000; // Max cached message hashes

  private constructor() {
    this.messageCache = new LRUCache<string, number>({
      max: this.CACHE_SIZE,
      ttl: this.DEDUP_WINDOW
    });

    // Start metrics reporting
    this.startMetricsReporting();
  }

  public static getInstance(): WebSocketOptimizer {
    if (!WebSocketOptimizer.instance) {
      WebSocketOptimizer.instance = new WebSocketOptimizer();
    }
    return WebSocketOptimizer.instance;
  }

  /**
   * Process outgoing message with optimizations
   */
  public async optimizeOutgoing(
    event: string,
    data: any,
    room?: string
  ): Promise<{
    shouldSend: boolean;
    optimized: any;
    metadata: {
      deduplicated?: boolean;
      compressed?: boolean;
      batched?: boolean;
      originalSize?: number;
      optimizedSize?: number;
    };
  }> {
    const metadata: any = {};

    // Step 1: Deduplication
    const hash = this.hashMessage(event, data, room);
    const lastSent = this.messageCache.get(hash);

    if (lastSent && Date.now() - lastSent < this.DEDUP_WINDOW) {
      this.metrics.deduplicated++;
      metadata.deduplicated = true;
      return { shouldSend: false, optimized: null, metadata };
    }

    // Update cache
    this.messageCache.set(hash, Date.now());

    // Step 2: Check if should batch
    if (this.shouldBatch(event, data, room)) {
      const batched = await this.addToBatch(event, data, room);
      if (batched) {
        this.metrics.batched++;
        metadata.batched = true;
        return { shouldSend: false, optimized: null, metadata };
      }
    }

    // Step 3: Compression
    const compressed = await this.compressMessage(data);
    if (compressed.compressed) {
      this.metrics.compressed++;
      this.metrics.bytesSaved += compressed.originalSize - (compressed.compressedSize || 0);
      metadata.compressed = true;
      metadata.originalSize = compressed.originalSize;
      metadata.optimizedSize = compressed.compressedSize;
    }

    // Update metrics
    this.metrics.sent++;
    this.metrics.bytesOut += compressed.compressedSize || compressed.originalSize;

    return {
      shouldSend: true,
      optimized: {
        event,
        data: compressed.data,
        compressed: compressed.compressed,
        timestamp: Date.now()
      },
      metadata
    };
  }

  /**
   * Process incoming message
   */
  public async optimizeIncoming(message: any): Promise<any> {
    this.metrics.received++;

    // Decompress if needed
    if (message.compressed && message.data) {
      try {
        const decompressed = await this.decompressMessage(message.data);
        message.data = decompressed;
        message.compressed = false;
      } catch (error) {
        logger.error(LogCategory.WEBSOCKET, 'Failed to decompress message', error);
      }
    }

    // Handle batched messages
    if (message.batch && Array.isArray(message.messages)) {
      return this.processBatchedMessages(message.messages);
    }

    return message;
  }

  /**
   * Hash message for deduplication
   */
  private hashMessage(event: string, data: any, room?: string): string {
    const content = JSON.stringify({ event, data, room });
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Compress message if beneficial
   */
  private async compressMessage(data: any): Promise<CompressionResult> {
    const serialized = JSON.stringify(data);
    const originalSize = Buffer.byteLength(serialized);

    // Only compress if above threshold
    if (originalSize < this.COMPRESSION_THRESHOLD) {
      return {
        compressed: false,
        data,
        originalSize
      };
    }

    try {
      const compressed = await gzipAsync(serialized);
      const compressedSize = compressed.length;

      // Only use compression if it saves >10% space
      if (compressedSize < originalSize * 0.9) {
        return {
          compressed: true,
          data: compressed.toString('base64'),
          originalSize,
          compressedSize
        };
      }
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'Compression failed', error);
    }

    return {
      compressed: false,
      data,
      originalSize
    };
  }

  /**
   * Decompress message
   */
  private async decompressMessage(data: string): Promise<any> {
    const buffer = Buffer.from(data, 'base64');
    const decompressed = await gunzipAsync(buffer);
    return JSON.parse(decompressed.toString());
  }

  /**
   * Check if message should be batched
   */
  private shouldBatch(event: string, data: any, room?: string): boolean {
    // Don't batch critical events
    const criticalEvents = [
      'error',
      'disconnect',
      'authentication',
      'farm:status:critical'
    ];

    if (criticalEvents.includes(event)) {
      return false;
    }

    // Don't batch large messages
    const size = Buffer.byteLength(JSON.stringify(data));
    if (size > this.COMPRESSION_THRESHOLD * 2) {
      return false;
    }

    // Batch by room for efficiency
    return true;
  }

  /**
   * Add message to batch
   */
  private async addToBatch(
    event: string,
    data: any,
    room: string = 'global'
  ): Promise<boolean> {
    const batchKey = `${room}:batch`;

    if (!this.messageBatches.has(batchKey)) {
      this.messageBatches.set(batchKey, {
        messages: [],
        timestamp: Date.now(),
        size: 0
      });

      // Set timer to flush batch
      const timer = setTimeout(() => {
        this.flushBatch(batchKey);
      }, this.BATCH_TIME_WINDOW);

      this.batchTimers.set(batchKey, timer);
    }

    const batch = this.messageBatches.get(batchKey)!;
    const messageSize = Buffer.byteLength(JSON.stringify(data));

    batch.messages.push({ event, data, timestamp: Date.now() });
    batch.size += messageSize;

    // Flush if batch is full
    if (batch.messages.length >= this.BATCH_SIZE_LIMIT) {
      this.flushBatch(batchKey);
      return true;
    }

    return true;
  }

  /**
   * Flush batch of messages
   */
  private async flushBatch(batchKey: string): Promise<void> {
    const batch = this.messageBatches.get(batchKey);
    if (!batch || batch.messages.length === 0) {
      return;
    }

    // Clear timer
    const timer = this.batchTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.batchTimers.delete(batchKey);
    }

    // Compress batch if beneficial
    const compressed = await this.compressMessage(batch.messages);

    // Send batched message
    const [room] = batchKey.split(':');
    const websocketHub = (await import('./unified/websocketHub')).websocketHub;

    websocketHub.broadcastToRoom(room, 'batch', {
      batch: true,
      compressed: compressed.compressed,
      messages: compressed.data,
      count: batch.messages.length,
      timestamp: Date.now()
    });

    // Update metrics
    this.metrics.sent++;
    this.metrics.batched += batch.messages.length;
    this.metrics.bytesOut += compressed.compressedSize || compressed.originalSize;

    // Clear batch
    this.messageBatches.delete(batchKey);
  }

  /**
   * Process batched messages on receive
   */
  private processBatchedMessages(messages: any[]): any[] {
    const processed: any[] = [];

    for (const message of messages) {
      // Check for duplicates
      const hash = this.hashMessage(message.event, message.data, null);
      const lastReceived = this.messageCache.get(hash);

      if (!lastReceived || Date.now() - lastReceived >= this.DEDUP_WINDOW) {
        this.messageCache.set(hash, Date.now());
        processed.push(message);
      } else {
        this.metrics.deduplicated++;
      }
    }

    return processed;
  }

  /**
   * Intelligent message routing
   */
  public getOptimalRoute(
    clientIds: string[],
    message: any
  ): {
    rooms: string[];
    directClients: string[];
    broadcast: boolean;
  } {
    const result = {
      rooms: [] as string[],
      directClients: [] as string[],
      broadcast: false
    };

    // If targeting >50% of clients, use broadcast
    const websocketHub = (require('./unified/websocketHub')).websocketHub;
    const totalClients = websocketHub.getConnectedClients().size;

    if (clientIds.length > totalClients * 0.5) {
      result.broadcast = true;
      return result;
    }

    // Group clients by common rooms
    const roomCounts = new Map<string, number>();

    for (const clientId of clientIds) {
      const client = websocketHub.getClient(clientId);
      if (client) {
        for (const room of client.rooms) {
          roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
        }
      }
    }

    // Use rooms if they cover multiple clients efficiently
    for (const [room, count] of roomCounts.entries()) {
      if (count >= 3) { // Room is efficient for 3+ clients
        result.rooms.push(room);
      } else {
        // Direct send is more efficient
        const roomClients = websocketHub.getClientsInRoom(room);
        for (const clientId of clientIds) {
          if (roomClients.has(clientId)) {
            result.directClients.push(clientId);
          }
        }
      }
    }

    return result;
  }

  /**
   * Start metrics reporting
   */
  private startMetricsReporting(): void {
    setInterval(() => {
      const efficiency = this.metrics.bytesSaved > 0
        ? Math.round((this.metrics.bytesSaved / (this.metrics.bytesOut + this.metrics.bytesSaved)) * 100)
        : 0;

      logger.info(LogCategory.WEBSOCKET, 'WebSocket Optimization Metrics', {
        sent: this.metrics.sent,
        received: this.metrics.received,
        deduplicated: this.metrics.deduplicated,
        compressed: this.metrics.compressed,
        batched: this.metrics.batched,
        bytesSaved: `${Math.round(this.metrics.bytesSaved / 1024)}KB`,
        efficiency: `${efficiency}%`
      });

      // Reset counters but keep totals
      this.metrics.sent = 0;
      this.metrics.received = 0;
      this.metrics.deduplicated = 0;
      this.metrics.compressed = 0;
      this.metrics.batched = 0;
    }, 60000); // Report every minute
  }

  /**
   * Get current metrics
   */
  public getMetrics(): MessageMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear all caches and batches
   */
  public clear(): void {
    this.messageCache.clear();

    // Clear all batch timers
    for (const timer of this.batchTimers.values()) {
      clearTimeout(timer);
    }

    this.messageBatches.clear();
    this.batchTimers.clear();
  }

  /**
   * Flush all pending batches
   */
  public async flushAll(): Promise<void> {
    const batchKeys = Array.from(this.messageBatches.keys());

    for (const key of batchKeys) {
      await this.flushBatch(key);
    }
  }
}

// Export singleton
export const wsOptimizer = WebSocketOptimizer.getInstance();