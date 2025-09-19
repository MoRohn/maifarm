import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

export interface EventMetadata {
  eventId: string;
  correlationId: string;
  causationId?: string;
  timestamp: Date;
  source: string;
  userId?: string;
  version: string;
}

export interface DomainEvent {
  type: string;
  aggregateId: string;
  payload: any;
  metadata: EventMetadata;
}

export interface EventSubscription {
  id: string;
  eventType: string | RegExp;
  handler: EventHandler;
  filter?: (event: DomainEvent) => boolean;
  options?: {
    once?: boolean;
    priority?: number;
    async?: boolean;
    retryCount?: number;
    retryDelay?: number;
  };
}

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

/**
 * Centralized Event Bus for domain events
 * Implements publish-subscribe pattern with advanced features
 */
export class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventHistory: DomainEvent[] = [];
  private maxHistorySize = 1000;
  private deadLetterQueue: Array<{ event: DomainEvent; error: Error; attempts: number }> = [];
  private middleware: Array<(event: DomainEvent) => Promise<DomainEvent>> = [];
  private isReplayMode = false;

  private constructor() {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.setupErrorHandling();
    this.startDeadLetterProcessor();
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventType: string | RegExp,
    handler: EventHandler,
    options?: EventSubscription['options']
  ): string {
    const subscriptionId = uuidv4();
    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      handler,
      options
    };

    this.subscriptions.set(subscriptionId, subscription);

    // Create event listener
    const wrappedHandler = this.wrapHandler(subscription);
    
    if (typeof eventType === 'string') {
      if (options?.once) {
        this.emitter.once(eventType, wrappedHandler);
      } else {
        this.emitter.on(eventType, wrappedHandler);
      }
    } else {
      // For regex patterns, listen to all events and filter
      this.emitter.on('*', (event: DomainEvent) => {
        if (eventType.test(event.type)) {
          wrappedHandler(event);
        }
      });
    }

    logger.debug(`[EventBus] Subscribed to ${eventType}`, { subscriptionId });
    return subscriptionId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);
    
    if (typeof subscription.eventType === 'string') {
      this.emitter.removeAllListeners(subscription.eventType);
    }

    logger.debug(`[EventBus] Unsubscribed`, { subscriptionId });
    return true;
  }

  /**
   * Publish an event
   */
  async publish(event: DomainEvent): Promise<void> {
    // Apply middleware
    let processedEvent = event;
    for (const mw of this.middleware) {
      processedEvent = await mw(processedEvent);
    }

    // Add to history
    this.addToHistory(processedEvent);

    // Emit event
    this.emitter.emit(processedEvent.type, processedEvent);
    this.emitter.emit('*', processedEvent);

    logger.debug(`[EventBus] Published event`, {
      type: processedEvent.type,
      aggregateId: processedEvent.aggregateId,
      correlationId: processedEvent.metadata.correlationId
    });
  }

  /**
   * Publish multiple events in order
   */
  async publishBatch(events: DomainEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  /**
   * Create and publish an event
   */
  async emit(
    type: string,
    aggregateId: string,
    payload: any,
    metadata?: Partial<EventMetadata>
  ): Promise<void> {
    const event: DomainEvent = {
      type,
      aggregateId,
      payload,
      metadata: {
        eventId: uuidv4(),
        correlationId: metadata?.correlationId || uuidv4(),
        causationId: metadata?.causationId,
        timestamp: new Date(),
        source: metadata?.source || 'system',
        userId: metadata?.userId,
        version: '1.0.0'
      }
    };

    await this.publish(event);
  }

  /**
   * Add middleware for event processing
   */
  use(middleware: (event: DomainEvent) => Promise<DomainEvent>): void {
    this.middleware.push(middleware);
  }

  /**
   * Replay events from history
   */
  async replay(
    filter?: (event: DomainEvent) => boolean,
    fromTimestamp?: Date
  ): Promise<void> {
    this.isReplayMode = true;
    
    const eventsToReplay = this.eventHistory.filter(event => {
      if (fromTimestamp && event.metadata.timestamp < fromTimestamp) {
        return false;
      }
      return filter ? filter(event) : true;
    });

    logger.info(`[EventBus] Replaying ${eventsToReplay.length} events`);

    for (const event of eventsToReplay) {
      await this.publish(event);
    }

    this.isReplayMode = false;
  }

  /**
   * Get event history
   */
  getHistory(
    filter?: (event: DomainEvent) => boolean,
    limit?: number
  ): DomainEvent[] {
    let events = filter ? this.eventHistory.filter(filter) : [...this.eventHistory];
    
    if (limit) {
      events = events.slice(-limit);
    }

    return events;
  }

  /**
   * Wait for specific event
   */
  async waitFor(
    eventType: string,
    timeout: number = 5000,
    filter?: (event: DomainEvent) => boolean
  ): Promise<DomainEvent> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.emitter.removeListener(eventType, handler);
        reject(new Error(`Timeout waiting for event ${eventType}`));
      }, timeout);

      const handler = (event: DomainEvent) => {
        if (!filter || filter(event)) {
          clearTimeout(timer);
          this.emitter.removeListener(eventType, handler);
          resolve(event);
        }
      };

      this.emitter.once(eventType, handler);
    });
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    logger.info('[EventBus] Event history cleared');
  }

  /**
   * Get statistics
   */
  getStats(): {
    subscriptions: number;
    historySize: number;
    deadLetterQueueSize: number;
    eventTypes: string[];
  } {
    const eventTypes = new Set<string>();
    this.eventHistory.forEach(event => eventTypes.add(event.type));

    return {
      subscriptions: this.subscriptions.size,
      historySize: this.eventHistory.length,
      deadLetterQueueSize: this.deadLetterQueue.length,
      eventTypes: Array.from(eventTypes)
    };
  }

  /**
   * Wrap handler with error handling and retry logic
   */
  private wrapHandler(subscription: EventSubscription): EventHandler {
    return async (event: DomainEvent) => {
      try {
        // Apply filter if exists
        if (subscription.filter && !subscription.filter(event)) {
          return;
        }

        // Skip if in replay mode and handler doesn't support replay
        if (this.isReplayMode && !subscription.options?.async) {
          return;
        }

        // Execute handler
        if (subscription.options?.async) {
          // Non-blocking execution
          setImmediate(async () => {
            try {
              await subscription.handler(event);
            } catch (error) {
              this.handleError(event, error as Error, subscription);
            }
          });
        } else {
          // Blocking execution
          await subscription.handler(event);
        }

      } catch (error) {
        this.handleError(event, error as Error, subscription);
      }
    };
  }

  /**
   * Handle errors with retry logic
   */
  private handleError(
    event: DomainEvent,
    error: Error,
    subscription: EventSubscription
  ): void {
    logger.error(`[EventBus] Error handling event`, {
      eventType: event.type,
      subscriptionId: subscription.id,
      error: error.message
    });

    // Add to dead letter queue if max retries exceeded
    const maxRetries = subscription.options?.retryCount || 3;
    const existingEntry = this.deadLetterQueue.find(
      entry => entry.event.metadata.eventId === event.metadata.eventId
    );

    if (existingEntry) {
      existingEntry.attempts++;
      if (existingEntry.attempts < maxRetries) {
        // Schedule retry
        const delay = subscription.options?.retryDelay || 1000;
        setTimeout(() => {
          subscription.handler(event).catch(err => {
            logger.error(`[EventBus] Retry failed`, { 
              eventId: event.metadata.eventId,
              attempt: existingEntry.attempts 
            });
          });
        }, delay * existingEntry.attempts);
      }
    } else {
      this.deadLetterQueue.push({ event, error, attempts: 1 });
    }
  }

  /**
   * Add event to history with size management
   */
  private addToHistory(event: DomainEvent): void {
    this.eventHistory.push(event);
    
    // Trim history if too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.emitter.on('error', (error: Error) => {
      logger.error('[EventBus] Emitter error', { error: error.message });
    });
  }

  /**
   * Process dead letter queue periodically
   */
  private startDeadLetterProcessor(): void {
    setInterval(() => {
      if (this.deadLetterQueue.length === 0) return;

      logger.info(`[EventBus] Processing ${this.deadLetterQueue.length} dead letter events`);
      
      // Process and clear old entries
      const cutoff = Date.now() - 3600000; // 1 hour
      this.deadLetterQueue = this.deadLetterQueue.filter(entry => {
        const age = Date.now() - entry.event.metadata.timestamp.getTime();
        return age < cutoff;
      });
    }, 60000); // Every minute
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();