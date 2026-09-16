import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger';

export interface Query {
  id: string;
  type: string;
  criteria: any;
  options?: {
    pagination?: {
      offset: number;
      limit: number;
    };
    sorting?: {
      field: string;
      direction: 'ASC' | 'DESC';
    };
    projection?: string[];
  };
  metadata: {
    correlationId: string;
    userId?: string;
    timestamp: Date;
  };
}

export interface QueryResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  meta?: {
    total?: number;
    page?: number;
    pageSize?: number;
    cached?: boolean;
    executionTime?: number;
  };
}

/**
 * Base class for all query handlers
 * Implements the Query part of CQRS pattern
 */
export abstract class QueryHandler<TQuery extends Query, TResult = any> {
  protected cache: Map<string, { data: any; timestamp: number }> = new Map();
  protected cacheTTL: number = 60000; // 1 minute default
  protected eventEmitter: EventEmitter;

  constructor(eventEmitter: EventEmitter, cacheTTL?: number) {
    this.eventEmitter = eventEmitter;
    if (cacheTTL) this.cacheTTL = cacheTTL;
  }

  /**
   * Main execution method with caching and monitoring
   */
  async execute(query: TQuery): Promise<QueryResult<TResult>> {
    const startTime = Date.now();
    const correlationId = query.metadata.correlationId || uuidv4();
    const cacheKey = this.getCacheKey(query);

    logger.debug(`[QueryHandler] Executing query ${query.type}`, {
      correlationId,
      queryId: query.id,
      userId: query.metadata.userId
    });

    try {
      // Check cache
      if (this.isCacheable(query)) {
        const cached = this.getFromCache(cacheKey);
        if (cached) {
          logger.debug(`[QueryHandler] Cache hit for ${query.type}`, { correlationId });
          return {
            success: true,
            data: cached,
            meta: {
              cached: true,
              executionTime: Date.now() - startTime
            }
          };
        }
      }

      // Validate query
      await this.validate(query);

      // Execute query
      const result = await this.handle(query);

      // Cache result if applicable
      if (this.isCacheable(query) && result.success && result.data) {
        this.setCache(cacheKey, result.data);
      }

      // Emit success event
      this.eventEmitter.emit('query:executed', {
        query,
        result,
        duration: Date.now() - startTime,
        correlationId
      });

      return {
        ...result,
        meta: {
          ...result.meta,
          cached: false,
          executionTime: Date.now() - startTime
        }
      };

    } catch (error) {
      logger.error(`[QueryHandler] Query ${query.type} failed`, {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Emit failure event
      this.eventEmitter.emit('query:failed', {
        query,
        error,
        duration: Date.now() - startTime,
        correlationId
      });

      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
        meta: {
          executionTime: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Validate query before execution
   */
  protected abstract validate(query: TQuery): Promise<void>;

  /**
   * Handle the actual query logic
   */
  protected abstract handle(query: TQuery): Promise<QueryResult<TResult>>;

  /**
   * Determine if query results should be cached
   */
  protected isCacheable(query: TQuery): boolean {
    // Override in subclasses for custom logic
    return true;
  }

  /**
   * Generate cache key for query
   */
  protected getCacheKey(query: TQuery): string {
    return `${query.type}:${JSON.stringify(query.criteria)}:${JSON.stringify(query.options)}`;
  }

  /**
   * Get data from cache
   */
  protected getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  /**
   * Set data in cache
   */
  protected setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });

    // Clean old cache entries
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries());
      const now = Date.now();
      entries.forEach(([k, v]) => {
        if (now - v.timestamp > this.cacheTTL) {
          this.cache.delete(k);
        }
      });
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Query Bus for routing queries to handlers
 */
export class QueryBus {
  private handlers: Map<string, QueryHandler<any, any>> = new Map();
  private eventEmitter: EventEmitter;
  private middleware: Array<(query: Query) => Promise<Query>> = [];

  constructor(eventEmitter: EventEmitter) {
    this.eventEmitter = eventEmitter;
  }

  /**
   * Register a query handler
   */
  register<T extends Query>(
    queryType: string,
    handler: QueryHandler<T, any>
  ): void {
    if (this.handlers.has(queryType)) {
      throw new Error(`Handler for query ${queryType} already registered`);
    }
    this.handlers.set(queryType, handler);
    logger.info(`[QueryBus] Registered handler for ${queryType}`);
  }

  /**
   * Add middleware for query processing
   */
  use(middleware: (query: Query) => Promise<Query>): void {
    this.middleware.push(middleware);
  }

  /**
   * Execute a query
   */
  async execute<T = any>(query: Query): Promise<QueryResult<T>> {
    // Apply middleware
    let processedQuery = query;
    for (const mw of this.middleware) {
      processedQuery = await mw(processedQuery);
    }

    // Find handler
    const handler = this.handlers.get(processedQuery.type);
    if (!handler) {
      logger.error(`[QueryBus] No handler registered for query ${processedQuery.type}`);
      return {
        success: false,
        error: new Error(`No handler for query type: ${processedQuery.type}`)
      };
    }

    // Execute query
    return handler.execute(processedQuery);
  }

  /**
   * Create a query
   */
  createQuery(
    type: string,
    criteria: any,
    options?: Query['options'],
    metadata?: Partial<Query['metadata']>
  ): Query {
    return {
      id: uuidv4(),
      type,
      criteria,
      options,
      metadata: {
        correlationId: metadata?.correlationId || uuidv4(),
        userId: metadata?.userId,
        timestamp: new Date()
      }
    };
  }

  /**
   * Get registered query types
   */
  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.handlers.forEach(handler => handler.clearCache());
    logger.info('[QueryBus] All query caches cleared');
  }
}