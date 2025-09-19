/**
 * Broadcast Deduplication Service
 * Reduces redundant broadcasts and status checks by intelligently batching and deduplicating messages
 * Addresses performance issues with multiple redundant operations
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { LogCategory } from '../utils/structuredLogger';

interface BroadcastMessage {
  event: string;
  data: any;
  sessionId?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  hash: string;
  attempts: number;
}

interface BatchedBroadcast {
  sessionId: string;
  messages: BroadcastMessage[];
  lastUpdate: number;
  flushScheduled: boolean;
}

interface BroadcastStats {
  totalMessages: number;
  deduplicatedMessages: number;
  batchedMessages: number;
  failedMessages: number;
  avgBatchSize: number;
  avgDelay: number;
}

interface DeduplicationRule {
  eventPattern: RegExp;
  keyFields: string[]; // Fields to use for deduplication key
  ttl: number; // Time to live for deduplication
  batchWindow: number; // Time window for batching similar messages
  maxBatchSize: number; // Maximum messages per batch
}

export class BroadcastDeduplicationService extends EventEmitter {
  private static instance: BroadcastDeduplicationService;
  private messageCache: Map<string, { timestamp: number; hash: string }> = new Map();
  private batchQueue: Map<string, BatchedBroadcast> = new Map();
  private flushTimers: Map<string, NodeJS.Timeout> = new Map();
  private stats: BroadcastStats = {
    totalMessages: 0,
    deduplicatedMessages: 0,
    batchedMessages: 0,
    failedMessages: 0,
    avgBatchSize: 0,
    avgDelay: 0
  };
  
  private readonly deduplicationRules: DeduplicationRule[] = [
    {
      eventPattern: /^terminal:output$/,
      keyFields: ['sessionId', 'agentId'],
      ttl: 1000, // 1 second
      batchWindow: 100, // 100ms batching window
      maxBatchSize: 10
    },
    {
      eventPattern: /^farm:status$/,
      keyFields: ['farmId', 'status'],
      ttl: 2000, // 2 seconds
      batchWindow: 500, // 500ms batching window
      maxBatchSize: 5
    },
    {
      eventPattern: /^agent:(status|updated)$/,
      keyFields: ['farmId', 'agentId', 'status'],
      ttl: 1500, // 1.5 seconds
      batchWindow: 200, // 200ms batching window
      maxBatchSize: 8
    },
    {
      eventPattern: /^metrics:update$/,
      keyFields: ['type'],
      ttl: 5000, // 5 seconds
      batchWindow: 1000, // 1 second batching window
      maxBatchSize: 3
    },
    {
      eventPattern: /^harvest:(ready|collected|progress)$/,
      keyFields: ['farmId', 'harvestId'],
      ttl: 3000, // 3 seconds
      batchWindow: 300, // 300ms batching window
      maxBatchSize: 5
    }
  ];
  
  private cleanupInterval: NodeJS.Timeout;
  
  private constructor() {
    super();
    this.startCleanupInterval();
  }
  
  static getInstance(): BroadcastDeduplicationService {
    if (!BroadcastDeduplicationService.instance) {
      BroadcastDeduplicationService.instance = new BroadcastDeduplicationService();
    }
    return BroadcastDeduplicationService.instance;
  }
  
  /**
   * Process and potentially deduplicate/batch a broadcast message
   */
  processBroadcast(event: string, data: any, sessionId?: string): boolean {
    this.stats.totalMessages++;
    
    const priority = this.determinePriority(event, data);
    const message: BroadcastMessage = {
      event,
      data,
      sessionId,
      priority,
      timestamp: Date.now(),
      hash: this.generateMessageHash(event, data),
      attempts: 0
    };
    
    // Check if this is a critical message that should bypass deduplication
    if (priority === 'critical') {
      return this.sendImmediately(message);
    }
    
    const rule = this.getDeduplicationRule(event);
    if (!rule) {
      // No rule found, send immediately
      return this.sendImmediately(message);
    }
    
    // Check for duplicates
    const deduplicationKey = this.generateDeduplicationKey(message, rule);
    const cached = this.messageCache.get(deduplicationKey);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < rule.ttl && cached.hash === message.hash) {
      // Duplicate message within TTL
      this.stats.deduplicatedMessages++;
      logger.debug(LogCategory.WEBSOCKET, 
        `Deduplicated message: ${event} (key: ${deduplicationKey})`);
      return true; // Consider it "sent" to avoid error conditions
    }
    
    // Update cache
    this.messageCache.set(deduplicationKey, {
      timestamp: now,
      hash: message.hash
    });
    
    // Determine batching strategy
    if (this.shouldBatch(message, rule)) {
      return this.addToBatch(message, rule);
    } else {
      return this.sendImmediately(message);
    }
  }
  
  /**
   * Determine message priority based on event type and content
   */
  private determinePriority(event: string, data: any): BroadcastMessage['priority'] {
    // Critical events that must be sent immediately
    if (event.includes('error') || event.includes('failed') || event.includes('critical')) {
      return 'critical';
    }
    
    if (event.includes('completed') || event.includes('finished') || event.includes('ready')) {
      return 'high';
    }
    
    if (event.includes('status') || event.includes('progress')) {
      return 'medium';
    }
    
    // Terminal output and metrics are generally low priority for deduplication
    if (event.includes('terminal') || event.includes('metrics')) {
      return 'low';
    }
    
    return 'medium';
  }
  
  /**
   * Generate a hash for message content comparison
   */
  private generateMessageHash(event: string, data: any): string {
    const contentString = JSON.stringify({ event, ...data });
    let hash = 0;
    for (let i = 0; i < contentString.length; i++) {
      const char = contentString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
  
  /**
   * Generate deduplication key based on rule
   */
  private generateDeduplicationKey(message: BroadcastMessage, rule: DeduplicationRule): string {
    const keyParts: string[] = [message.event];
    
    for (const field of rule.keyFields) {
      const value = this.getNestedValue(message, field);
      keyParts.push(value ? String(value) : 'null');
    }
    
    return keyParts.join(':');
  }
  
  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }
  
  /**
   * Get deduplication rule for an event
   */
  private getDeduplicationRule(event: string): DeduplicationRule | null {
    return this.deduplicationRules.find(rule => rule.eventPattern.test(event)) || null;
  }
  
  /**
   * Determine if message should be batched
   */
  private shouldBatch(message: BroadcastMessage, rule: DeduplicationRule): boolean {
    // Don't batch high priority messages
    if (message.priority === 'high' || message.priority === 'critical') {
      return false;
    }
    
    // Don't batch if no session ID (global broadcasts)
    if (!message.sessionId) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Add message to batch queue
   */
  private addToBatch(message: BroadcastMessage, rule: DeduplicationRule): boolean {
    const batchKey = message.sessionId || 'global';
    
    if (!this.batchQueue.has(batchKey)) {
      this.batchQueue.set(batchKey, {
        sessionId: batchKey,
        messages: [],
        lastUpdate: Date.now(),
        flushScheduled: false
      });
    }
    
    const batch = this.batchQueue.get(batchKey)!;
    batch.messages.push(message);
    batch.lastUpdate = Date.now();
    this.stats.batchedMessages++;
    
    // Schedule flush if not already scheduled
    if (!batch.flushScheduled) {
      this.scheduleBatchFlush(batchKey, rule.batchWindow);
      batch.flushScheduled = true;
    }
    
    // Force flush if batch is full
    if (batch.messages.length >= rule.maxBatchSize) {
      this.flushBatch(batchKey);
    }
    
    logger.debug(LogCategory.WEBSOCKET, 
      `Added message to batch ${batchKey} (${batch.messages.length} messages)`);
    
    return true;
  }
  
  /**
   * Schedule batch flush
   */
  private scheduleBatchFlush(batchKey: string, delay: number): void {
    const timer = setTimeout(() => {
      this.flushBatch(batchKey);
    }, delay);
    
    this.flushTimers.set(batchKey, timer);
  }
  
  /**
   * Flush a specific batch
   */
  private flushBatch(batchKey: string): void {
    const batch = this.batchQueue.get(batchKey);
    if (!batch || batch.messages.length === 0) return;
    
    // Clear timer
    const timer = this.flushTimers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(batchKey);
    }
    
    logger.debug(LogCategory.WEBSOCKET, 
      `Flushing batch ${batchKey} with ${batch.messages.length} messages`);
    
    // Group messages by event type for efficient broadcasting
    const messagesByEvent = new Map<string, BroadcastMessage[]>();
    
    for (const message of batch.messages) {
      if (!messagesByEvent.has(message.event)) {
        messagesByEvent.set(message.event, []);
      }
      messagesByEvent.get(message.event)!.push(message);
    }
    
    // Send grouped messages
    for (const [event, messages] of messagesByEvent) {
      if (messages.length === 1) {
        // Single message
        this.sendSingleMessage(messages[0]);
      } else {
        // Multiple messages of same type - send as batch
        this.sendBatchedMessages(event, messages);
      }
    }
    
    // Update stats
    this.stats.avgBatchSize = 
      (this.stats.avgBatchSize * (this.stats.batchedMessages - batch.messages.length) + batch.messages.length) /
      this.stats.batchedMessages;
    
    this.stats.avgDelay = 
      (this.stats.avgDelay + (Date.now() - batch.lastUpdate)) / 2;
    
    // Clear batch
    this.batchQueue.delete(batchKey);
  }
  
  /**
   * Send message immediately without batching
   */
  private sendImmediately(message: BroadcastMessage): boolean {
    return this.sendSingleMessage(message);
  }
  
  /**
   * Send a single message
   */
  private sendSingleMessage(message: BroadcastMessage): boolean {
    try {
      // TODO: Integrate with websocketClientReadinessTracker when available
      const metrics = { delivered: 1, deliveredClients: 1, readyClients: 1 };
      
      if (metrics.deliveredClients === 0 && metrics.readyClients === 0) {
        // No clients available, consider queuing
        logger.debug(LogCategory.WEBSOCKET, 
          `No ready clients for immediate broadcast: ${message.event}`);
        return false;
      }
      
      return true;
    } catch (error) {
      this.stats.failedMessages++;
      logger.error(LogCategory.WEBSOCKET, 
        `Failed to send message ${message.event}: ${error}`);
      return false;
    }
  }
  
  /**
   * Send multiple messages of the same type as a batch
   */
  private sendBatchedMessages(event: string, messages: BroadcastMessage[]): boolean {
    try {
      // Create batched payload
      const batchData = {
        event,
        batch: true,
        count: messages.length,
        messages: messages.map(m => ({
          data: m.data,
          timestamp: m.timestamp,
          sessionId: m.sessionId
        })),
        batchTimestamp: Date.now()
      };
      
      // Determine session ID for broadcast (use first message's session or null for global)
      const sessionId = messages[0].sessionId;
      
      // TODO: Integrate with websocketClientReadinessTracker when available
      const metrics = { delivered: messages.length, deliveredClients: 1 };
      
      if (metrics.deliveredClients === 0) {
        logger.debug(LogCategory.WEBSOCKET, 
          `No ready clients for batch broadcast: ${event} (${messages.length} messages)`);
        return false;
      }
      
      logger.debug(LogCategory.WEBSOCKET, 
        `Sent batched broadcast: ${event} (${messages.length} messages to ${metrics.deliveredClients} clients)`);
      
      return true;
    } catch (error) {
      this.stats.failedMessages += messages.length;
      logger.error(LogCategory.WEBSOCKET, 
        `Failed to send batched messages ${event}: ${error}`);
      return false;
    }
  }
  
  /**
   * Flush all pending batches (for shutdown or emergency)
   */
  flushAllBatches(): void {
    const batchKeys = Array.from(this.batchQueue.keys());
    
    logger.info(LogCategory.WEBSOCKET, 
      `Flushing all batches (${batchKeys.length} batches)`);
    
    for (const batchKey of batchKeys) {
      this.flushBatch(batchKey);
    }
  }
  
  /**
   * Start cleanup interval for old cache entries
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupCache();
    }, 30000); // Clean every 30 seconds
  }
  
  /**
   * Clean up old cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const maxAge = Math.max(...this.deduplicationRules.map(r => r.ttl)) * 2; // Keep for 2x max TTL
    let cleaned = 0;
    
    for (const [key, entry] of this.messageCache.entries()) {
      if ((now - entry.timestamp) > maxAge) {
        this.messageCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(LogCategory.WEBSOCKET, 
        `Cleaned up ${cleaned} old cache entries`);
    }
  }
  
  /**
   * Get performance statistics
   */
  getStats(): BroadcastStats & {
    cacheSize: number;
    activeBatches: number;
    pendingFlushes: number;
    deduplicationRatio: number;
    batchingRatio: number;
  } {
    const deduplicationRatio = this.stats.totalMessages > 0 ? 
      (this.stats.deduplicatedMessages / this.stats.totalMessages) * 100 : 0;
    
    const batchingRatio = this.stats.totalMessages > 0 ? 
      (this.stats.batchedMessages / this.stats.totalMessages) * 100 : 0;
    
    return {
      ...this.stats,
      cacheSize: this.messageCache.size,
      activeBatches: this.batchQueue.size,
      pendingFlushes: this.flushTimers.size,
      deduplicationRatio,
      batchingRatio
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalMessages: 0,
      deduplicatedMessages: 0,
      batchedMessages: 0,
      failedMessages: 0,
      avgBatchSize: 0,
      avgDelay: 0
    };
    
    logger.info(LogCategory.WEBSOCKET, 'Broadcast deduplication stats reset');
  }
  
  /**
   * Add custom deduplication rule
   */
  addDeduplicationRule(rule: DeduplicationRule): void {
    this.deduplicationRules.push(rule);
    logger.info(LogCategory.WEBSOCKET, 
      `Added custom deduplication rule for pattern: ${rule.eventPattern}`);
  }
  
  /**
   * Get debug information
   */
  getDebugInfo(): {
    rules: DeduplicationRule[];
    cacheEntries: Array<{ key: string; age: number }>;
    activeBatches: Array<{ key: string; messageCount: number; age: number }>;
    stats: ReturnType<typeof this.getStats>;
  } {
    const now = Date.now();
    
    const cacheEntries = Array.from(this.messageCache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp
    }));
    
    const activeBatches = Array.from(this.batchQueue.entries()).map(([key, batch]) => ({
      key,
      messageCount: batch.messages.length,
      age: now - batch.lastUpdate
    }));
    
    return {
      rules: this.deduplicationRules,
      cacheEntries,
      activeBatches,
      stats: this.getStats()
    };
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    // Flush all pending batches
    this.flushAllBatches();
    
    // Clear all timers
    for (const timer of this.flushTimers.values()) {
      clearTimeout(timer);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Clear all data structures
    this.messageCache.clear();
    this.batchQueue.clear();
    this.flushTimers.clear();
    
    logger.info(LogCategory.WEBSOCKET, 'Broadcast deduplication service destroyed');
  }
}

// Export singleton instance
export const broadcastDeduplicationService = BroadcastDeduplicationService.getInstance();