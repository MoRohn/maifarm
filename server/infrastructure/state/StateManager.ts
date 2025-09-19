import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { eventBus, DomainEvent } from '../events/EventBus';
import { logger } from '../../utils/logger';

export interface StateSnapshot {
  id: string;
  timestamp: Date;
  state: any;
  version: number;
  metadata: {
    correlationId?: string;
    userId?: string;
    source?: string;
  };
}

export interface StateChange {
  field: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

export interface AggregateState {
  id: string;
  type: string;
  version: number;
  state: any;
  lastModified: Date;
  changeHistory: StateChange[];
  snapshots: StateSnapshot[];
}

/**
 * Unified State Manager for managing application state
 * Implements Event Sourcing and Snapshot patterns
 */
export class StateManager extends EventEmitter {
  private static instance: StateManager;
  private aggregates: Map<string, AggregateState> = new Map();
  private projections: Map<string, any> = new Map();
  private snapshotInterval = 10; // Take snapshot every 10 versions
  private maxSnapshots = 5; // Keep last 5 snapshots
  private maxChangeHistory = 100; // Keep last 100 changes
  private subscribers: Map<string, Set<(state: any) => void>> = new Map();

  private constructor() {
    super();
    this.setupEventHandlers();
    this.startSnapshotCleanup();
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  /**
   * Initialize or restore aggregate state
   */
  async initializeAggregate(
    id: string,
    type: string,
    initialState?: any
  ): Promise<AggregateState> {
    if (this.aggregates.has(id)) {
      return this.aggregates.get(id)!;
    }

    const aggregate: AggregateState = {
      id,
      type,
      version: 0,
      state: initialState || {},
      lastModified: new Date(),
      changeHistory: [],
      snapshots: []
    };

    this.aggregates.set(id, aggregate);
    
    // Take initial snapshot
    await this.takeSnapshot(id);

    logger.info(`[StateManager] Initialized aggregate`, { id, type });
    
    return aggregate;
  }

  /**
   * Apply event to aggregate state
   */
  async applyEvent(event: DomainEvent): Promise<void> {
    const aggregate = this.aggregates.get(event.aggregateId);
    if (!aggregate) {
      logger.warn(`[StateManager] Aggregate not found for event`, {
        aggregateId: event.aggregateId,
        eventType: event.type
      });
      return;
    }

    // Store old state for change tracking
    const oldState = JSON.parse(JSON.stringify(aggregate.state));

    // Apply event based on type
    const newState = this.reduceEvent(aggregate.state, event);
    
    // Track changes
    const changes = this.detectChanges(oldState, newState);
    
    // Update aggregate
    aggregate.state = newState;
    aggregate.version++;
    aggregate.lastModified = new Date();
    aggregate.changeHistory.push(...changes);

    // Trim change history
    if (aggregate.changeHistory.length > this.maxChangeHistory) {
      aggregate.changeHistory = aggregate.changeHistory.slice(-this.maxChangeHistory);
    }

    // Take snapshot if needed
    if (aggregate.version % this.snapshotInterval === 0) {
      await this.takeSnapshot(event.aggregateId);
    }

    // Notify subscribers
    this.notifySubscribers(event.aggregateId, aggregate.state);

    // Update projections
    await this.updateProjections(event);

    // Emit state change event
    this.emit('stateChanged', {
      aggregateId: event.aggregateId,
      version: aggregate.version,
      changes,
      event
    });

    logger.debug(`[StateManager] Applied event to aggregate`, {
      aggregateId: event.aggregateId,
      eventType: event.type,
      version: aggregate.version
    });
  }

  /**
   * Get current state of aggregate
   */
  getState(aggregateId: string): any | null {
    const aggregate = this.aggregates.get(aggregateId);
    return aggregate ? JSON.parse(JSON.stringify(aggregate.state)) : null;
  }

  /**
   * Get aggregate with full metadata
   */
  getAggregate(aggregateId: string): AggregateState | null {
    const aggregate = this.aggregates.get(aggregateId);
    return aggregate ? JSON.parse(JSON.stringify(aggregate)) : null;
  }

  /**
   * Subscribe to state changes
   */
  subscribe(aggregateId: string, callback: (state: any) => void): () => void {
    if (!this.subscribers.has(aggregateId)) {
      this.subscribers.set(aggregateId, new Set());
    }
    
    this.subscribers.get(aggregateId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const subs = this.subscribers.get(aggregateId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(aggregateId);
        }
      }
    };
  }

  /**
   * Create or update projection
   */
  async createProjection(
    name: string,
    query: () => any,
    dependencies: string[] = []
  ): Promise<void> {
    try {
      const result = await query();
      this.projections.set(name, result);

      // Setup auto-update on dependency changes
      dependencies.forEach(aggregateId => {
        this.subscribe(aggregateId, async () => {
          const updated = await query();
          this.projections.set(name, updated);
          this.emit('projectionUpdated', { name, data: updated });
        });
      });

      logger.info(`[StateManager] Created projection`, { name });
    } catch (error) {
      logger.error(`[StateManager] Failed to create projection`, {
        name,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get projection data
   */
  getProjection(name: string): any | null {
    return this.projections.get(name) || null;
  }

  /**
   * Rebuild state from events
   */
  async rebuildFromEvents(
    aggregateId: string,
    events: DomainEvent[]
  ): Promise<AggregateState> {
    // Find or create aggregate
    let aggregate = this.aggregates.get(aggregateId);
    if (!aggregate) {
      aggregate = await this.initializeAggregate(aggregateId, 'rebuilt', {});
    }

    // Reset state
    aggregate.state = {};
    aggregate.version = 0;
    aggregate.changeHistory = [];

    // Replay events
    for (const event of events) {
      await this.applyEvent(event);
    }

    logger.info(`[StateManager] Rebuilt aggregate from ${events.length} events`, {
      aggregateId,
      finalVersion: aggregate.version
    });

    return aggregate;
  }

  /**
   * Restore from snapshot
   */
  async restoreFromSnapshot(
    aggregateId: string,
    snapshotId?: string
  ): Promise<boolean> {
    const aggregate = this.aggregates.get(aggregateId);
    if (!aggregate || aggregate.snapshots.length === 0) {
      return false;
    }

    let snapshot: StateSnapshot | undefined;
    
    if (snapshotId) {
      snapshot = aggregate.snapshots.find(s => s.id === snapshotId);
    } else {
      // Get latest snapshot
      snapshot = aggregate.snapshots[aggregate.snapshots.length - 1];
    }

    if (!snapshot) {
      return false;
    }

    // Restore state
    aggregate.state = JSON.parse(JSON.stringify(snapshot.state));
    aggregate.version = snapshot.version;
    aggregate.lastModified = snapshot.timestamp;

    logger.info(`[StateManager] Restored aggregate from snapshot`, {
      aggregateId,
      snapshotId: snapshot.id,
      version: snapshot.version
    });

    return true;
  }

  /**
   * Get state statistics
   */
  getStats(): {
    aggregateCount: number;
    projectionCount: number;
    totalSnapshots: number;
    totalChanges: number;
    memoryUsage: number;
  } {
    let totalSnapshots = 0;
    let totalChanges = 0;

    this.aggregates.forEach(aggregate => {
      totalSnapshots += aggregate.snapshots.length;
      totalChanges += aggregate.changeHistory.length;
    });

    return {
      aggregateCount: this.aggregates.size,
      projectionCount: this.projections.size,
      totalSnapshots,
      totalChanges,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.aggregates.clear();
    this.projections.clear();
    this.subscribers.clear();
    logger.info('[StateManager] Cleared all state');
  }

  /**
   * Take snapshot of aggregate state
   */
  private async takeSnapshot(aggregateId: string): Promise<void> {
    const aggregate = this.aggregates.get(aggregateId);
    if (!aggregate) return;

    const snapshot: StateSnapshot = {
      id: uuidv4(),
      timestamp: new Date(),
      state: JSON.parse(JSON.stringify(aggregate.state)),
      version: aggregate.version,
      metadata: {}
    };

    aggregate.snapshots.push(snapshot);

    // Trim old snapshots
    if (aggregate.snapshots.length > this.maxSnapshots) {
      aggregate.snapshots = aggregate.snapshots.slice(-this.maxSnapshots);
    }

    logger.debug(`[StateManager] Took snapshot`, {
      aggregateId,
      snapshotId: snapshot.id,
      version: snapshot.version
    });
  }

  /**
   * Reduce event to new state
   */
  private reduceEvent(currentState: any, event: DomainEvent): any {
    const newState = { ...currentState };

    // Apply event based on type
    switch (event.type) {
      case 'FARM_CREATED':
        return { ...newState, ...event.payload, status: 'idle' };
      
      case 'FARM_LAUNCHING':
        return { ...newState, status: 'launching', launchTime: event.metadata.timestamp };
      
      case 'FARM_LAUNCHED':
        return { ...newState, status: 'running', ...event.payload };
      
      case 'FARM_COMPLETED':
        return { ...newState, status: 'completed', completedAt: event.metadata.timestamp };
      
      case 'FARM_FAILED':
        return { ...newState, status: 'failed', error: event.payload.error };
      
      case 'AGENT_CREATED':
        if (!newState.agents) newState.agents = [];
        newState.agents.push(event.payload);
        return newState;
      
      case 'AGENT_STATUS_CHANGED':
        if (newState.agents) {
          const agent = newState.agents.find((a: any) => a.id === event.payload.agentId);
          if (agent) agent.status = event.payload.status;
        }
        return newState;
      
      case 'METRICS_UPDATED':
        return { ...newState, metrics: event.payload };
      
      default:
        // Generic merge for unknown events
        return { ...newState, ...event.payload };
    }
  }

  /**
   * Detect changes between states
   */
  private detectChanges(oldState: any, newState: any): StateChange[] {
    const changes: StateChange[] = [];
    const timestamp = new Date();

    const detectRecursive = (old: any, neu: any, path = '') => {
      // Check all keys in new state
      Object.keys(neu).forEach(key => {
        const fullPath = path ? `${path}.${key}` : key;
        
        if (!(key in old)) {
          changes.push({
            field: fullPath,
            oldValue: undefined,
            newValue: neu[key],
            timestamp
          });
        } else if (JSON.stringify(old[key]) !== JSON.stringify(neu[key])) {
          if (typeof neu[key] === 'object' && neu[key] !== null) {
            detectRecursive(old[key], neu[key], fullPath);
          } else {
            changes.push({
              field: fullPath,
              oldValue: old[key],
              newValue: neu[key],
              timestamp
            });
          }
        }
      });

      // Check for deleted keys
      Object.keys(old).forEach(key => {
        if (!(key in neu)) {
          const fullPath = path ? `${path}.${key}` : key;
          changes.push({
            field: fullPath,
            oldValue: old[key],
            newValue: undefined,
            timestamp
          });
        }
      });
    };

    detectRecursive(oldState, newState);
    return changes;
  }

  /**
   * Notify subscribers of state changes
   */
  private notifySubscribers(aggregateId: string, state: any): void {
    const subscribers = this.subscribers.get(aggregateId);
    if (!subscribers) return;

    subscribers.forEach(callback => {
      try {
        callback(JSON.parse(JSON.stringify(state)));
      } catch (error) {
        logger.error(`[StateManager] Error notifying subscriber`, {
          aggregateId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Update projections based on event
   */
  private async updateProjections(event: DomainEvent): Promise<void> {
    // This would be extended to update specific projections
    // based on event type and affected aggregates
    this.emit('projectionsUpdated', { event });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Subscribe to all domain events
    eventBus.subscribe('*', async (event: DomainEvent) => {
      await this.applyEvent(event);
    });
  }

  /**
   * Cleanup old snapshots periodically
   */
  private startSnapshotCleanup(): void {
    setInterval(() => {
      this.aggregates.forEach(aggregate => {
        // Remove snapshots older than 1 hour
        const cutoff = Date.now() - 3600000;
        aggregate.snapshots = aggregate.snapshots.filter(
          s => s.timestamp.getTime() > cutoff
        );
      });
    }, 300000); // Every 5 minutes
  }
}

// Export singleton instance
export const stateManager = StateManager.getInstance();