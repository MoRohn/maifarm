/**
 * Centralized State Coordinator
 * Single source of truth for all application state management
 * Replaces: StateCoordinator, unifiedCoordinationService, redisCoordinationStore, etc.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { redis, db } from '../../database/connection';
import { websocketManager } from '../../websocket/websocketManager';
import { logger } from '../../utils/logger';
import {
  MaiFarmError,
  ErrorCode,
  ErrorSeverity,
  ErrorHandler
} from '../../types/errors';

export enum EntityType {
  FARM = 'farm',
  AGENT = 'agent',
  TASK = 'task',
  HARVEST = 'harvest',
  SESSION = 'session',
  USER = 'user'
}

export enum StateEvent {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  STATUS_CHANGED = 'status_changed',
  HEARTBEAT = 'heartbeat',
  RECONCILED = 'reconciled'
}

export interface StateEntity {
  id: string;
  type: EntityType;
  status: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface StateChange {
  entityId: string;
  entityType: EntityType;
  event: StateEvent;
  previousState?: any;
  currentState: any;
  timestamp: Date;
  userId?: string;
  source: string;
}

export interface StateSnapshot {
  timestamp: Date;
  entities: Map<string, StateEntity>;
  pendingChanges: StateChange[];
  version: string;
}

interface StateSubscription {
  id: string;
  entityType?: EntityType;
  entityId?: string;
  events: StateEvent[];
  callback: (change: StateChange) => void;
}

interface ConflictResolution {
  strategy: 'latest' | 'merge' | 'manual';
  resolver?: (local: any, remote: any) => any;
}

class CentralizedStateCoordinator extends EventEmitter {
  private static instance: CentralizedStateCoordinator;
  private entities: Map<string, StateEntity> = new Map();
  private subscriptions: Map<string, StateSubscription> = new Map();
  private pendingChanges: StateChange[] = [];
  private reconciliationInterval: NodeJS.Timeout | null = null;
  private persistenceInterval: NodeJS.Timeout | null = null;
  private readonly REDIS_PREFIX = 'state:';
  private readonly REDIS_TTL = 3600; // 1 hour
  private readonly PERSISTENCE_INTERVAL = 10000; // 10 seconds
  private readonly RECONCILIATION_INTERVAL = 30000; // 30 seconds
  private readonly MAX_PENDING_CHANGES = 1000;
  private readonly STATE_VERSION = '1.0.0';
  private isInitialized = false;

  private constructor() {
    super();
    this.setMaxListeners(100); // Increase listener limit for many subscriptions
  }

  public static getInstance(): CentralizedStateCoordinator {
    if (!CentralizedStateCoordinator.instance) {
      CentralizedStateCoordinator.instance = new CentralizedStateCoordinator();
    }
    return CentralizedStateCoordinator.instance;
  }

  /**
   * Initialize the state coordinator
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load state from persistence
      await this.loadStateFromPersistence();

      // Start periodic tasks
      this.startPeriodicPersistence();
      this.startPeriodicReconciliation();

      // Setup event handlers
      this.setupEventHandlers();

      this.isInitialized = true;
      logger.info('CentralizedStateCoordinator initialized', {
        entityCount: this.entities.size,
        version: this.STATE_VERSION
      });

    } catch (error) {
      throw new MaiFarmError(
        ErrorCode.INTERNAL_SERVER,
        `Failed to initialize state coordinator: ${(error as Error).message}`,
        ErrorSeverity.CRITICAL
      );
    }
  }

  /**
   * Create or update an entity in the state
   */
  public async upsertEntity(
    id: string,
    type: EntityType,
    status: string,
    metadata: Record<string, any> = {},
    source: string = 'system'
  ): Promise<StateEntity> {
    const existingEntity = this.entities.get(id);
    const now = new Date();

    const entity: StateEntity = {
      id,
      type,
      status,
      metadata,
      createdAt: existingEntity?.createdAt || now,
      updatedAt: now,
      version: (existingEntity?.version || 0) + 1
    };

    // Store entity
    this.entities.set(id, entity);

    // Create state change record
    const change: StateChange = {
      entityId: id,
      entityType: type,
      event: existingEntity ? StateEvent.UPDATED : StateEvent.CREATED,
      previousState: existingEntity,
      currentState: entity,
      timestamp: now,
      source
    };

    // Add to pending changes
    this.addPendingChange(change);

    // Notify subscribers
    await this.notifySubscribers(change);

    // Cache in Redis for fast access
    await this.cacheEntity(entity);

    // Broadcast via WebSocket
    this.broadcastStateChange(change);

    logger.debug(`Entity ${type}:${id} upserted`, { status, version: entity.version });

    return entity;
  }

  /**
   * Update entity status
   */
  public async updateEntityStatus(
    id: string,
    status: string,
    source: string = 'system'
  ): Promise<void> {
    const entity = this.entities.get(id);
    if (!entity) {
      throw new MaiFarmError(
        ErrorCode.NOT_FOUND,
        `Entity ${id} not found`,
        ErrorSeverity.LOW,
        { entityId: id }
      );
    }

    const previousStatus = entity.status;
    entity.status = status;
    entity.updatedAt = new Date();
    entity.version++;

    // Create state change
    const change: StateChange = {
      entityId: id,
      entityType: entity.type,
      event: StateEvent.STATUS_CHANGED,
      previousState: { status: previousStatus },
      currentState: { status },
      timestamp: entity.updatedAt,
      source
    };

    // Process change
    this.addPendingChange(change);
    await this.notifySubscribers(change);
    await this.cacheEntity(entity);
    this.broadcastStateChange(change);

    logger.info(`Entity ${entity.type}:${id} status changed: ${previousStatus} -> ${status}`);
  }

  /**
   * Get entity by ID
   */
  public getEntity(id: string): StateEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Get entities by type
   */
  public getEntitiesByType(type: EntityType): StateEntity[] {
    return Array.from(this.entities.values()).filter(e => e.type === type);
  }

  /**
   * Get entities by status
   */
  public getEntitiesByStatus(type: EntityType, status: string): StateEntity[] {
    return Array.from(this.entities.values()).filter(
      e => e.type === type && e.status === status
    );
  }

  private getAgentEntityId(farmId: string, agentId: string | number): string {
    if (typeof agentId === 'string' && agentId.includes(farmId)) {
      return agentId;
    }
    const suffix = typeof agentId === 'number' ? agentId : agentId.toString();
    return `${farmId}:agent:${suffix}`;
  }

  public async updateAgentState(
    farmId: string,
    agentId: string | number,
    updates: Record<string, any>
  ): Promise<StateEntity> {
    const entityId = this.getAgentEntityId(farmId, agentId);
    const existing = this.entities.get(entityId);
    const status = updates.status || existing?.status || 'active';
    const metadata = {
      ...(existing?.metadata || {}),
      ...updates,
      farmId
    };

    return this.upsertEntity(entityId, EntityType.AGENT, status, metadata, 'coordination');
  }

  public async updateFarmState(
    farmId: string,
    updates: Record<string, any>
  ): Promise<StateEntity> {
    const existing = this.entities.get(farmId);
    const status = updates.status || existing?.status || 'active';
    const metadata = {
      ...(existing?.metadata || {}),
      ...updates
    };

    return this.upsertEntity(farmId, EntityType.FARM, status, metadata, 'coordination');
  }

  public getFarmState(farmId: string): StateEntity | undefined {
    return this.entities.get(farmId);
  }

  public getAgentState(farmId: string, agentId: string | number): StateEntity | undefined {
    const entityId = this.getAgentEntityId(farmId, agentId);
    return this.entities.get(entityId);
  }

  public getAgentsByFarm(farmId: string): StateEntity[] {
    return Array.from(this.entities.values()).filter(
      entity =>
        entity.type === EntityType.AGENT &&
        entity.metadata &&
        (entity.metadata.farmId === farmId || entity.metadata.farm_id === farmId)
    );
  }

  public getFarmStateSnapshot(farmId: string): {
    farm?: StateEntity;
    agents: StateEntity[];
  } {
    const farmEntity = this.entities.get(farmId);
    const agents = this.getAgentsByFarm(farmId);
    return {
      farm: farmEntity,
      agents
    };
  }

  /**
   * Delete an entity
   */
  public async deleteEntity(id: string, source: string = 'system'): Promise<void> {
    const entity = this.entities.get(id);
    if (!entity) {
      return;
    }

    // Remove from state
    this.entities.delete(id);

    // Create deletion change
    const change: StateChange = {
      entityId: id,
      entityType: entity.type,
      event: StateEvent.DELETED,
      previousState: entity,
      currentState: null,
      timestamp: new Date(),
      source
    };

    // Process change
    this.addPendingChange(change);
    await this.notifySubscribers(change);
    await this.removeCachedEntity(id);
    this.broadcastStateChange(change);

    logger.info(`Entity ${entity.type}:${id} deleted`);
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(
    events: StateEvent[],
    callback: (change: StateChange) => void,
    entityType?: EntityType,
    entityId?: string
  ): string {
    const subscriptionId = uuidv4();

    const subscription: StateSubscription = {
      id: subscriptionId,
      entityType,
      entityId,
      events,
      callback
    };

    this.subscriptions.set(subscriptionId, subscription);
    logger.debug(`Subscription ${subscriptionId} created`, { entityType, events });

    return subscriptionId;
  }

  /**
   * Unsubscribe from state changes
   */
  public unsubscribe(subscriptionId: string): void {
    this.subscriptions.delete(subscriptionId);
    logger.debug(`Subscription ${subscriptionId} removed`);
  }

  /**
   * Get current state snapshot
   */
  public getSnapshot(): StateSnapshot {
    return {
      timestamp: new Date(),
      entities: new Map(this.entities),
      pendingChanges: [...this.pendingChanges],
      version: this.STATE_VERSION
    };
  }

  /**
   * Reconcile state with external sources
   */
  public async reconcile(): Promise<{
    conflicts: number;
    resolved: number;
    failed: number;
  }> {
    const results = {
      conflicts: 0,
      resolved: 0,
      failed: 0
    };

    try {
      // Reconcile with database
      await this.reconcileWithDatabase(results);

      // Reconcile with Redis
      await this.reconcileWithRedis(results);

      // Reconcile with running services
      await this.reconcileWithServices(results);

      logger.info('State reconciliation completed', results);

      // Emit reconciliation event
      this.emit('reconciliation:completed', results);

    } catch (error) {
      logger.error('State reconciliation failed:', error);
      results.failed++;
    }

    return results;
  }

  /**
   * Force persist state to storage
   */
  public async persist(): Promise<void> {
    await this.persistToDisk();
    await this.persistToDatabase();
  }

  /**
   * Clear all state (dangerous!)
   */
  public async clearState(): Promise<void> {
    this.entities.clear();
    this.pendingChanges = [];
    await this.clearRedisCache();
    logger.warn('All state cleared');
  }

  /**
   * Load state from persistence
   */
  private async loadStateFromPersistence(): Promise<void> {
    try {
      // Try loading from Redis first (faster)
      const loaded = await this.loadFromRedis();

      if (!loaded) {
        // Fall back to database
        await this.loadFromDatabase();
      }

      logger.info(`Loaded ${this.entities.size} entities from persistence`);

    } catch (error) {
      logger.error('Failed to load state from persistence:', error);
      // Start with empty state
    }
  }

  /**
   * Load state from Redis
   */
  private async loadFromRedis(): Promise<boolean> {
    try {
      // Check if Redis is connected
      if (!redis || !redis.isReady) {
        logger.debug('Redis not ready, skipping Redis load');
        return false;
      }

      const keys = await redis.keys(`${this.REDIS_PREFIX}*`);

      if (keys.length === 0) {
        return false;
      }

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          const dataStr = typeof data === 'string' ? data : data.toString();
          const entity = JSON.parse(dataStr);
          entity.createdAt = new Date(entity.createdAt);
          entity.updatedAt = new Date(entity.updatedAt);
          this.entities.set(entity.id, entity);
        }
      }

      return true;
    } catch (error: any) {
      // If Redis is not connected, just skip loading from Redis
      if (error.message?.includes('ClientClosedError') || error.message?.includes('client is closed')) {
        logger.debug('Redis client is closed, skipping Redis load');
        return false;
      }
      logger.error('Failed to load from Redis:', error);
      return false;
    }
  }

  /**
   * Load state from database
   */
  private async loadFromDatabase(): Promise<void> {
    try {
      // Load farms
      const farms = await db.query('SELECT * FROM farms WHERE status != $1', ['deleted']);
      for (const farm of farms.rows) {
        await this.upsertEntity(
          farm.id,
          EntityType.FARM,
          farm.status,
          farm.config || {},
          'database'
        );
      }

      // Load agents
      const agents = await db.query('SELECT * FROM agents');
      for (const agent of agents.rows) {
        await this.upsertEntity(
          agent.id,
          EntityType.AGENT,
          agent.status,
          { farmId: agent.farm_id },
          'database'
        );
      }

      // Load tasks
      const tasks = await db.query('SELECT * FROM tasks WHERE status NOT IN ($1, $2)', ['completed', 'cancelled']);
      for (const task of tasks.rows) {
        await this.upsertEntity(
          task.id,
          EntityType.TASK,
          task.status,
          task.metadata || {},
          'database'
        );
      }

    } catch (error) {
      logger.error('Failed to load from database:', error);
    }
  }

  /**
   * Cache entity in Redis
   */
  private async cacheEntity(entity: StateEntity): Promise<void> {
    try {
      if (!redis || !redis.isReady) {
        return;
      }
      const key = `${this.REDIS_PREFIX}${entity.id}`;
      // Redis v4 uses setEx (camelCase) instead of setex
      await redis.setEx(key, this.REDIS_TTL, JSON.stringify(entity));
    } catch (error) {
      logger.error(`Failed to cache entity ${entity.id}:`, error);
    }
  }

  /**
   * Remove cached entity
   */
  private async removeCachedEntity(id: string): Promise<void> {
    try {
      await redis.del(`${this.REDIS_PREFIX}${id}`);
    } catch (error) {
      logger.error(`Failed to remove cached entity ${id}:`, error);
    }
  }

  /**
   * Clear Redis cache
   */
  private async clearRedisCache(): Promise<void> {
    const keys = await redis.keys(`${this.REDIS_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(keys as [string, ...string[]]);
    }
  }

  /**
   * Add pending change
   */
  private addPendingChange(change: StateChange): void {
    this.pendingChanges.push(change);

    // Limit pending changes
    if (this.pendingChanges.length > this.MAX_PENDING_CHANGES) {
      this.pendingChanges.shift();
    }
  }

  /**
   * Notify subscribers of state change
   */
  private async notifySubscribers(change: StateChange): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      // Check if subscription matches
      if (!subscription.events.includes(change.event)) {
        continue;
      }

      if (subscription.entityType && subscription.entityType !== change.entityType) {
        continue;
      }

      if (subscription.entityId && subscription.entityId !== change.entityId) {
        continue;
      }

      // Notify subscriber
      try {
        subscription.callback(change);
      } catch (error) {
        logger.error(`Subscription ${subscription.id} callback failed:`, error);
      }
    }
  }

  /**
   * Broadcast state change via WebSocket
   */
  private broadcastStateChange(change: StateChange): void {
    const event = `state:${change.entityType}:${change.event}`;
    websocketManager.broadcast(event, change);

    // Also broadcast generic state change event
    websocketManager.broadcast('state:changed', change);
  }

  /**
   * Start periodic persistence
   */
  private startPeriodicPersistence(): void {
    this.persistenceInterval = setInterval(async () => {
      try {
        await this.persist();
      } catch (error) {
        logger.error('Periodic persistence failed:', error);
      }
    }, this.PERSISTENCE_INTERVAL);
  }

  /**
   * Start periodic reconciliation
   */
  private startPeriodicReconciliation(): void {
    this.reconciliationInterval = setInterval(async () => {
      try {
        await this.reconcile();
      } catch (error) {
        logger.error('Periodic reconciliation failed:', error);
      }
    }, this.RECONCILIATION_INTERVAL);
  }

  /**
   * Persist to disk (backup)
   */
  private async persistToDisk(): Promise<void> {
    // Implementation for disk persistence (optional backup)
    // Could write to a JSON file for disaster recovery
  }

  /**
   * Persist to database
   */
  private async persistToDatabase(): Promise<void> {
    // Batch update entities in database
    const updates = [];

    for (const entity of this.entities.values()) {
      if (entity.type === EntityType.FARM) {
        updates.push(
          db.query(
            'UPDATE farms SET status = $1, updated_at = $2 WHERE id = $3',
            [entity.status, entity.updatedAt, entity.id]
          )
        );
      } else if (entity.type === EntityType.AGENT) {
        updates.push(
          db.query(
            'UPDATE agents SET status = $1, updated_at = $2 WHERE id = $3',
            [entity.status, entity.updatedAt, entity.id]
          )
        );
      }
    }

    if (updates.length > 0) {
      await Promise.all(updates);
      logger.debug(`Persisted ${updates.length} entities to database`);
    }
  }

  /**
   * Reconcile with database
   */
  private async reconcileWithDatabase(results: any): Promise<void> {
    // Check for discrepancies between state and database
    const farms = await db.query('SELECT id, status FROM farms');

    for (const farm of farms.rows) {
      const stateEntity = this.entities.get(farm.id);

      if (!stateEntity) {
        // Entity in DB but not in state
        await this.upsertEntity(
          farm.id,
          EntityType.FARM,
          farm.status,
          {},
          'reconciliation'
        );
        results.resolved++;
      } else if (stateEntity.status !== farm.status) {
        // Status mismatch
        results.conflicts++;
        // Use database as source of truth
        await this.updateEntityStatus(farm.id, farm.status, 'reconciliation');
        results.resolved++;
      }
    }
  }

  /**
   * Reconcile with Redis
   */
  private async reconcileWithRedis(results: any): Promise<void> {
    const keys = await redis.keys(`${this.REDIS_PREFIX}*`);

    for (const key of keys) {
      const keyStr = typeof key === 'string' ? key : key.toString();
      const entityId = keyStr.replace(this.REDIS_PREFIX, '');
      const stateEntity = this.entities.get(entityId);

      if (!stateEntity) {
        // Entity in Redis but not in state
        const data = await redis.get(keyStr);
        if (data) {
          const dataStr = typeof data === 'string' ? data : data.toString();
          const entity = JSON.parse(dataStr);
          entity.createdAt = new Date(entity.createdAt);
          entity.updatedAt = new Date(entity.updatedAt);
          this.entities.set(entityId, entity);
          results.resolved++;
        }
      }
    }
  }

  /**
   * Reconcile with running services
   */
  private async reconcileWithServices(results: any): Promise<void> {
    // Get active farms from farm service
    const { farmService } = await import('./farmService');
    const activeFarms = farmService.getAllFarms();

    for (const farm of activeFarms) {
      const stateEntity = this.entities.get(farm.id);

      if (!stateEntity) {
        // Farm running but not in state
        await this.upsertEntity(
          farm.id,
          EntityType.FARM,
          farm.status,
          farm.config,
          'reconciliation'
        );
        results.resolved++;
      } else if (stateEntity.status !== farm.status) {
        // Status mismatch - trust running service
        await this.updateEntityStatus(farm.id, farm.status, 'reconciliation');
        results.conflicts++;
        results.resolved++;
      }
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle process exit
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());

    // Handle service events
    this.on('entity:heartbeat', (entityId: string) => {
      const entity = this.entities.get(entityId);
      if (entity) {
        entity.updatedAt = new Date();
        this.cacheEntity(entity);
      }
    });
  }

  /**
   * Shutdown gracefully
   */
  private async shutdown(): Promise<void> {
    logger.info('Shutting down CentralizedStateCoordinator');

    // Stop intervals
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
    }

    // Final persistence
    await this.persist();

    logger.info('CentralizedStateCoordinator shutdown complete');
  }

  /**
   * Get state statistics
   */
  public getStatistics(): {
    totalEntities: number;
    byType: Record<EntityType, number>;
    pendingChanges: number;
    subscriptions: number;
  } {
    const byType: any = {};

    for (const type of Object.values(EntityType)) {
      byType[type] = this.getEntitiesByType(type).length;
    }

    return {
      totalEntities: this.entities.size,
      byType,
      pendingChanges: this.pendingChanges.length,
      subscriptions: this.subscriptions.size
    };
  }
}

// Export singleton instance
export const stateCoordinator = CentralizedStateCoordinator.getInstance();
