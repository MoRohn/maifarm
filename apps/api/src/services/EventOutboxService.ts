/**
 * Event Outbox Service
 *
 * Implements guaranteed event delivery using the outbox pattern:
 * 1. Events are persisted to database before broadcasting
 * 2. Background processor polls and delivers events
 * 3. Failed events are retried with exponential backoff
 * 4. Permanently failed events move to Dead Letter Queue
 * 5. Idempotency guarantees prevent duplicate delivery
 */

import { db } from '../database/connection';
import { logger, LogCategory } from '../utils/logger';
import { unifiedWebSocketManager } from '../websocket/UnifiedWebSocketManager';
import { EventEmitter } from 'events';

export interface OutboxEvent {
  id?: string;
  eventName: string;
  eventData: any;
  aggregateId?: string;
  aggregateType?: 'farm' | 'agent' | 'harvest' | 'task' | 'terminal';
  priority?: number; // 1=highest, 10=lowest
  targetRoom?: string;
  targetUserId?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface DeliveryStats {
  totalProcessed: number;
  delivered: number;
  failed: number;
  movedToDLQ: number;
  averageLatency: number;
  currentBacklog: number;
}

export class EventOutboxService extends EventEmitter {
  private static instance: EventOutboxService;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 1000; // 1 second
  private readonly BATCH_SIZE = 50;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second
  private readonly MAX_RETRY_DELAY = 60000; // 60 seconds
  private isProcessing = false;

  // Stats
  private stats: DeliveryStats = {
    totalProcessed: 0,
    delivered: 0,
    failed: 0,
    movedToDLQ: 0,
    averageLatency: 0,
    currentBacklog: 0
  };

  private constructor() {
    super();
    logger.info(LogCategory.WEBSOCKET, 'EventOutboxService initialized');
  }

  static getInstance(): EventOutboxService {
    if (!EventOutboxService.instance) {
      EventOutboxService.instance = new EventOutboxService();
    }
    return EventOutboxService.instance;
  }

  /**
   * Start background event processor
   */
  start(): void {
    if (this.processingInterval) {
      logger.warn(LogCategory.WEBSOCKET, 'Event processor already running');
      return;
    }

    logger.info(LogCategory.WEBSOCKET, 'Starting event outbox processor');

    this.processingInterval = setInterval(async () => {
      await this.processOutbox();
    }, this.POLL_INTERVAL);

    // Immediate first run
    this.processOutbox();
  }

  /**
   * Stop background event processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info(LogCategory.WEBSOCKET, 'Event outbox processor stopped');
    }
  }

  /**
   * Publish event to outbox (transactional)
   */
  async publish(event: OutboxEvent): Promise<string> {
    try {
      const result = await db.query(
        `INSERT INTO event_outbox (
          event_name,
          event_data,
          aggregate_id,
          aggregate_type,
          priority,
          target_room,
          target_user_id,
          idempotency_key,
          max_attempts,
          status,
          next_retry_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', CURRENT_TIMESTAMP)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id`,
        [
          event.eventName,
          JSON.stringify(event.eventData),
          event.aggregateId,
          event.aggregateType,
          event.priority || 5,
          event.targetRoom,
          event.targetUserId,
          event.idempotencyKey,
          event.maxAttempts || 3
        ]
      );

      if (result.rows.length === 0) {
        logger.debug(LogCategory.WEBSOCKET,
          `Event ${event.eventName} skipped (duplicate idempotency key: ${event.idempotencyKey})`);
        throw new Error('DUPLICATE_EVENT');
      }

      const eventId = result.rows[0].id;

      logger.debug(LogCategory.WEBSOCKET,
        `Event ${event.eventName} published to outbox (id: ${eventId})`);

      this.emit('event:published', { eventId, eventName: event.eventName });

      return eventId;
    } catch (error) {
      if (error instanceof Error && error.message === 'DUPLICATE_EVENT') {
        throw error;
      }

      logger.error(LogCategory.WEBSOCKET, `Failed to publish event to outbox:`, error);
      throw error;
    }
  }

  /**
   * Publish event with automatic idempotency key
   */
  async publishIdempotent(
    eventName: string,
    eventData: any,
    options: Omit<OutboxEvent, 'eventName' | 'eventData'> = {}
  ): Promise<string> {
    const idempotencyKey = options.idempotencyKey || this.generateIdempotencyKey(eventName, eventData);

    return this.publish({
      eventName,
      eventData,
      ...options,
      idempotencyKey
    });
  }

  /**
   * Process outbox queue
   */
  private async processOutbox(): Promise<void> {
    if (this.isProcessing) {
      return; // Skip if already processing
    }

    this.isProcessing = true;

    try {
      // Get pending events ready for delivery
      const result = await db.query(
        `SELECT id, event_name, event_data, target_room, target_user_id,
                attempts, max_attempts, priority, aggregate_id, aggregate_type,
                sequence_number
         FROM event_outbox
         WHERE status = 'pending'
           AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
         ORDER BY priority ASC, sequence_number ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [this.BATCH_SIZE]
      );

      const events = result.rows;

      if (events.length === 0) {
        return; // No events to process
      }

      logger.debug(LogCategory.WEBSOCKET, `Processing ${events.length} events from outbox`);

      // Process events in parallel with concurrency limit
      const batchSize = 10;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        await Promise.all(batch.map((event: any) => this.deliverEvent(event)));
      }

      // Update backlog stats
      await this.updateBacklogStats();

    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'Error processing outbox:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Deliver single event
   */
  private async deliverEvent(event: any): Promise<void> {
    const startTime = Date.now();

    try {
      // Mark as processing
      await db.query(
        `UPDATE event_outbox
         SET status = 'processing', last_attempt_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [event.id]
      );

      const eventData = typeof event.event_data === 'string'
        ? JSON.parse(event.event_data)
        : event.event_data;

      // Deliver via WebSocket with acknowledgment
      let delivered = false;
      let deliveryError: string | undefined;

      try {
        if (event.target_room) {
          // Broadcast to room with ACK
          const result = await unifiedWebSocketManager.broadcastWithAck(
            event.event_name,
            eventData,
            { room: event.target_room, timeout: 5000, retryAttempts: 2 }
          );
          delivered = result.success;
          deliveryError = result.failed > 0 ? `${result.failed} clients failed` : undefined;
        } else if (event.target_user_id) {
          // Broadcast to user
          unifiedWebSocketManager.broadcastToUser(event.target_user_id, event.event_name, eventData);
          delivered = true;
        } else {
          // Broadcast to all
          unifiedWebSocketManager.broadcast(event.event_name, eventData);
          delivered = true;
        }
      } catch (error) {
        deliveryError = error instanceof Error ? error.message : String(error);
        logger.error(LogCategory.WEBSOCKET, `Error delivering event ${event.id}:`, error);
      }

      const latency = Date.now() - startTime;

      if (delivered) {
        // Mark as delivered
        await db.query(
          `UPDATE event_outbox
           SET status = 'delivered',
               delivered_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [event.id]
        );

        // Log delivery
        await this.logDelivery(event, true, latency);

        this.stats.delivered++;
        this.stats.totalProcessed++;
        this.updateAverageLatency(latency);

        logger.debug(LogCategory.WEBSOCKET,
          `Event ${event.event_name} delivered successfully (${latency}ms)`);

        this.emit('event:delivered', {
          eventId: event.id,
          eventName: event.event_name,
          latency
        });

      } else {
        // Handle retry or failure
        const newAttempts = event.attempts + 1;
        const maxAttempts = event.max_attempts || 3;

        if (newAttempts >= maxAttempts) {
          // Move to failed (will trigger DLQ via database trigger)
          await db.query(
            `UPDATE event_outbox
             SET status = 'failed',
                 attempts = $1,
                 error_message = $2
             WHERE id = $3`,
            [newAttempts, deliveryError || 'Max attempts exceeded', event.id]
          );

          this.stats.failed++;
          this.stats.movedToDLQ++;

          logger.warn(LogCategory.WEBSOCKET,
            `Event ${event.event_name} moved to DLQ after ${newAttempts} attempts`);

          this.emit('event:failed', {
            eventId: event.id,
            eventName: event.event_name,
            attempts: newAttempts,
            error: deliveryError
          });

        } else {
          // Schedule retry with exponential backoff
          const retryDelay = this.calculateRetryDelay(newAttempts);
          const nextRetryAt = new Date(Date.now() + retryDelay);

          await db.query(
            `UPDATE event_outbox
             SET status = 'pending',
                 attempts = $1,
                 error_message = $2,
                 next_retry_at = $3
             WHERE id = $4`,
            [newAttempts, deliveryError, nextRetryAt, event.id]
          );

          logger.debug(LogCategory.WEBSOCKET,
            `Event ${event.event_name} scheduled for retry in ${retryDelay}ms (attempt ${newAttempts}/${maxAttempts})`);

          this.emit('event:retry', {
            eventId: event.id,
            eventName: event.event_name,
            attempt: newAttempts,
            nextRetryAt
          });
        }

        // Log delivery attempt
        await this.logDelivery(event, false, latency, deliveryError);
      }

    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, `Failed to process event ${event.id}:`, error);

      // Mark as pending for retry
      await db.query(
        `UPDATE event_outbox
         SET status = 'pending',
             attempts = attempts + 1,
             error_message = $1
         WHERE id = $2`,
        [error instanceof Error ? error.message : 'Processing error', event.id]
      );
    }
  }

  /**
   * Log delivery attempt
   */
  private async logDelivery(
    event: any,
    delivered: boolean,
    latency: number,
    error?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO event_delivery_log (
          outbox_id, event_name, socket_id, room, delivered,
          latency_ms, error, retry_number, sequence_number
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.id,
          event.event_name,
          'outbox-processor', // Special identifier for outbox processor
          event.target_room,
          delivered,
          latency,
          error,
          event.attempts || 0,
          event.sequence_number
        ]
      );
    } catch (err) {
      logger.error(LogCategory.WEBSOCKET, 'Failed to log delivery:', err);
    }
  }

  /**
   * Calculate exponential backoff retry delay
   */
  private calculateRetryDelay(attempts: number): number {
    const delay = this.BASE_RETRY_DELAY * Math.pow(2, attempts - 1);
    const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
    return Math.min(delay + jitter, this.MAX_RETRY_DELAY);
  }

  /**
   * Generate idempotency key
   */
  private generateIdempotencyKey(eventName: string, eventData: any): string {
    const crypto = require('crypto');
    const content = JSON.stringify({ eventName, eventData });
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Update average latency stat
   */
  private updateAverageLatency(newLatency: number): void {
    const totalDelivered = this.stats.delivered;
    if (totalDelivered === 1) {
      this.stats.averageLatency = newLatency;
    } else {
      this.stats.averageLatency =
        (this.stats.averageLatency * (totalDelivered - 1) + newLatency) / totalDelivered;
    }
  }

  /**
   * Update backlog stats
   */
  private async updateBacklogStats(): Promise<void> {
    try {
      const result = await db.query(
        `SELECT COUNT(*) as count
         FROM event_outbox
         WHERE status = 'pending'`
      );
      this.stats.currentBacklog = parseInt(result.rows[0].count);
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'Failed to update backlog stats:', error);
    }
  }

  /**
   * Get delivery statistics
   */
  getStats(): DeliveryStats {
    return { ...this.stats };
  }

  /**
   * Retry failed event from DLQ
   */
  async retryFromDLQ(dlqId: string): Promise<string> {
    try {
      const result = await db.query(
        'SELECT retry_dlq_event($1) as outbox_id',
        [dlqId]
      );

      const outboxId = result.rows[0].outbox_id;

      logger.info(LogCategory.WEBSOCKET,
        `Event from DLQ ${dlqId} moved back to outbox (${outboxId})`);

      return outboxId;
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, `Failed to retry event from DLQ:`, error);
      throw error;
    }
  }

  /**
   * Get DLQ entries
   */
  async getDLQEntries(limit: number = 50): Promise<any[]> {
    try {
      const result = await db.query(
        `SELECT id, event_name, aggregate_id, aggregate_type, attempts,
                last_error, failed_at, recovered
         FROM event_dead_letter_queue
         WHERE NOT recovered
         ORDER BY failed_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows;
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'Failed to fetch DLQ entries:', error);
      return [];
    }
  }

  /**
   * Clean up old delivered events
   */
  async cleanupOldEvents(retentionDays: number = 7): Promise<number> {
    try {
      const result = await db.query(
        'SELECT cleanup_delivered_events($1) as deleted_count',
        [retentionDays]
      );

      const deletedCount = result.rows[0].deleted_count;

      logger.info(LogCategory.WEBSOCKET,
        `Cleaned up ${deletedCount} delivered events older than ${retentionDays} days`);

      return deletedCount;
    } catch (error) {
      logger.error(LogCategory.WEBSOCKET, 'Failed to cleanup old events:', error);
      return 0;
    }
  }
}

export const eventOutboxService = EventOutboxService.getInstance();
