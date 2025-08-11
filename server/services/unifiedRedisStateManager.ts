/**
 * Unified Redis State Manager
 * Centralizes all Redis operations and ensures consistent state management
 * Replaces fragmented coordination systems with a single source of truth
 */

import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Farm state machine states
export enum FarmStatus {
  INITIALIZING = 'initializing',
  LAUNCHING = 'launching', 
  RUNNING = 'running',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error',
  TIMEOUT = 'timeout',
  COMPLETED = 'completed'
}

// Valid state transitions
const STATE_TRANSITIONS: Record<FarmStatus, FarmStatus[]> = {
  [FarmStatus.INITIALIZING]: [FarmStatus.LAUNCHING, FarmStatus.ERROR],
  [FarmStatus.LAUNCHING]: [FarmStatus.RUNNING, FarmStatus.ERROR, FarmStatus.TIMEOUT],
  [FarmStatus.RUNNING]: [FarmStatus.STOPPING, FarmStatus.COMPLETED, FarmStatus.ERROR, FarmStatus.TIMEOUT],
  [FarmStatus.STOPPING]: [FarmStatus.STOPPED, FarmStatus.ERROR],
  [FarmStatus.STOPPED]: [],
  [FarmStatus.ERROR]: [FarmStatus.STOPPING, FarmStatus.STOPPED],
  [FarmStatus.TIMEOUT]: [FarmStatus.STOPPING, FarmStatus.STOPPED],
  [FarmStatus.COMPLETED]: [FarmStatus.STOPPED]
};

export interface FarmState {
  id: string;
  name: string;
  status: FarmStatus;
  agents: string[];
  processId?: string;
  sessionId?: string;
  harvestId?: string;
  config: Record<string, any>;
  metrics: {
    startTime: Date;
    lastUpdate: Date;
    heartbeatTime?: Date;
    completionTime?: Date;
    errorCount: number;
    reconnectCount: number;
  };
  error?: string;
}

export interface AgentState {
  id: string;
  farmId: string;
  name: string;
  status: 'initializing' | 'ready' | 'working' | 'idle' | 'error' | 'stopped';
  tmuxPane?: string;
  currentTask?: string;
  metrics: {
    startTime: Date;
    lastUpdate: Date;
    heartbeatTime: Date;
    tasksCompleted: number;
    errors: number;
  };
}

export interface ConnectionState {
  clientId: string;
  farmId?: string;
  socketId?: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
  quality: 'excellent' | 'good' | 'poor' | 'critical';
  metrics: {
    connectedAt?: Date;
    disconnectedAt?: Date;
    reconnectCount: number;
    lastHeartbeat?: Date;
    latency?: number;
    packetLoss?: number;
  };
}

export class UnifiedRedisStateManager extends EventEmitter {
  private redis: Redis;
  private subscriber: Redis;
  private publisher: Redis;
  private readonly keyPrefix = 'maifarm:';
  private readonly lockTTL = 5000; // 5 seconds for distributed locks
  private readonly stateTTL = 3600; // 1 hour for state expiry
  private cleanupInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis) {
    super();
    this.redis = redis;
    this.subscriber = redis.duplicate();
    this.publisher = redis.duplicate();
    this.initialize();
  }

  private async initialize() {
    // Setup pub/sub for real-time updates
    await this.subscriber.subscribe(
      `${this.keyPrefix}events:farms`,
      `${this.keyPrefix}events:agents`,
      `${this.keyPrefix}events:connections`
    );

    this.subscriber.on('message', (channel, message) => {
      try {
        const event = JSON.parse(message);
        const eventType = channel.split(':').pop();
        this.emit(eventType, event);
      } catch (error) {
        console.error('[UnifiedRedisStateManager] Failed to parse event:', error);
      }
    });

    // Start cleanup and health check intervals
    this.startCleanupInterval();
    this.startHealthCheckInterval();

    console.log('[UnifiedRedisStateManager] Initialized');
  }

  /**
   * Farm State Management with State Machine
   */

  async createFarm(farm: Omit<FarmState, 'id' | 'metrics'>): Promise<FarmState> {
    const farmId = uuidv4();
    const now = new Date();
    
    const farmState: FarmState = {
      ...farm,
      id: farmId,
      status: FarmStatus.INITIALIZING,
      metrics: {
        startTime: now,
        lastUpdate: now,
        errorCount: 0,
        reconnectCount: 0
      }
    };

    // Use distributed lock for atomic creation
    const lockKey = `${this.keyPrefix}lock:farm:${farmId}`;
    const lock = await this.acquireLock(lockKey);
    
    if (!lock) {
      throw new Error('Failed to acquire lock for farm creation');
    }

    try {
      // Store farm state
      await this.redis.hset(
        `${this.keyPrefix}farm:${farmId}`,
        this.serializeObject(farmState)
      );

      // Add to active farms set
      await this.redis.sadd(`${this.keyPrefix}farms:active`, farmId);

      // Set TTL
      await this.redis.expire(`${this.keyPrefix}farm:${farmId}`, this.stateTTL);

      // Publish creation event
      await this.publishEvent('farms', {
        type: 'farm:created',
        farmId,
        data: farmState,
        timestamp: now
      });

      return farmState;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async updateFarmStatus(farmId: string, newStatus: FarmStatus, error?: string): Promise<FarmState | null> {
    const lockKey = `${this.keyPrefix}lock:farm:${farmId}`;
    const lock = await this.acquireLock(lockKey);
    
    if (!lock) {
      console.error(`[UnifiedRedisStateManager] Failed to acquire lock for farm ${farmId}`);
      return null;
    }

    try {
      const currentState = await this.getFarmState(farmId);
      if (!currentState) {
        console.error(`[UnifiedRedisStateManager] Farm ${farmId} not found`);
        return null;
      }

      // Validate state transition
      const validTransitions = STATE_TRANSITIONS[currentState.status];
      if (!validTransitions.includes(newStatus)) {
        console.error(`[UnifiedRedisStateManager] Invalid state transition: ${currentState.status} -> ${newStatus}`);
        return null;
      }

      // Update state
      const now = new Date();
      currentState.status = newStatus;
      currentState.metrics.lastUpdate = now;
      
      if (error) {
        currentState.error = error;
        currentState.metrics.errorCount++;
      }

      if (newStatus === FarmStatus.COMPLETED || newStatus === FarmStatus.STOPPED) {
        currentState.metrics.completionTime = now;
        // Move from active to completed set
        await this.redis.srem(`${this.keyPrefix}farms:active`, farmId);
        await this.redis.sadd(`${this.keyPrefix}farms:completed`, farmId);
      }

      // Save updated state
      await this.redis.hset(
        `${this.keyPrefix}farm:${farmId}`,
        this.serializeObject(currentState)
      );

      // Refresh TTL
      await this.redis.expire(`${this.keyPrefix}farm:${farmId}`, this.stateTTL);

      // Publish update event
      await this.publishEvent('farms', {
        type: 'farm:status:changed',
        farmId,
        oldStatus: currentState.status,
        newStatus,
        data: currentState,
        timestamp: now
      });

      return currentState;
    } finally {
      await this.releaseLock(lockKey);
    }
  }

  async getFarmState(farmId: string): Promise<FarmState | null> {
    const data = await this.redis.hgetall(`${this.keyPrefix}farm:${farmId}`);
    if (!data || Object.keys(data).length === 0) return null;
    return this.deserializeObject(data) as FarmState;
  }

  async getActiveFarms(): Promise<FarmState[]> {
    const farmIds = await this.redis.smembers(`${this.keyPrefix}farms:active`);
    const farms: FarmState[] = [];

    for (const farmId of farmIds) {
      const farm = await this.getFarmState(farmId);
      if (farm) farms.push(farm);
    }

    return farms;
  }

  async recordFarmHeartbeat(farmId: string): Promise<void> {
    const now = new Date();
    await this.redis.hset(
      `${this.keyPrefix}farm:${farmId}`,
      'metrics.heartbeatTime', now.toISOString()
    );
    await this.redis.expire(`${this.keyPrefix}farm:${farmId}`, this.stateTTL);
  }

  /**
   * Agent State Management
   */

  async createAgent(agent: Omit<AgentState, 'id' | 'metrics'>): Promise<AgentState> {
    const agentId = uuidv4();
    const now = new Date();

    const agentState: AgentState = {
      ...agent,
      id: agentId,
      status: 'initializing',
      metrics: {
        startTime: now,
        lastUpdate: now,
        heartbeatTime: now,
        tasksCompleted: 0,
        errors: 0
      }
    };

    // Store agent state
    await this.redis.hset(
      `${this.keyPrefix}agent:${agentId}`,
      this.serializeObject(agentState)
    );

    // Add to farm's agent set
    await this.redis.sadd(`${this.keyPrefix}farm:${agent.farmId}:agents`, agentId);

    // Set TTL
    await this.redis.expire(`${this.keyPrefix}agent:${agentId}`, this.stateTTL);

    // Publish creation event
    await this.publishEvent('agents', {
      type: 'agent:created',
      agentId,
      farmId: agent.farmId,
      data: agentState,
      timestamp: now
    });

    return agentState;
  }

  async updateAgentStatus(agentId: string, status: AgentState['status'], currentTask?: string): Promise<AgentState | null> {
    const data = await this.redis.hgetall(`${this.keyPrefix}agent:${agentId}`);
    if (!data || Object.keys(data).length === 0) return null;

    const agent = this.deserializeObject(data) as AgentState;
    const now = new Date();

    agent.status = status;
    agent.currentTask = currentTask;
    agent.metrics.lastUpdate = now;
    agent.metrics.heartbeatTime = now;

    await this.redis.hset(
      `${this.keyPrefix}agent:${agentId}`,
      this.serializeObject(agent)
    );

    await this.redis.expire(`${this.keyPrefix}agent:${agentId}`, this.stateTTL);

    // Publish update event
    await this.publishEvent('agents', {
      type: 'agent:status:changed',
      agentId,
      farmId: agent.farmId,
      status,
      currentTask,
      timestamp: now
    });

    return agent;
  }

  async getFarmAgents(farmId: string): Promise<AgentState[]> {
    const agentIds = await this.redis.smembers(`${this.keyPrefix}farm:${farmId}:agents`);
    const agents: AgentState[] = [];

    for (const agentId of agentIds) {
      const data = await this.redis.hgetall(`${this.keyPrefix}agent:${agentId}`);
      if (data && Object.keys(data).length > 0) {
        agents.push(this.deserializeObject(data) as AgentState);
      }
    }

    return agents;
  }

  /**
   * Connection State Management
   */

  async createConnection(clientId: string, socketId?: string): Promise<ConnectionState> {
    const now = new Date();
    
    const connectionState: ConnectionState = {
      clientId,
      socketId,
      status: 'connected',
      quality: 'excellent',
      metrics: {
        connectedAt: now,
        reconnectCount: 0
      }
    };

    await this.redis.hset(
      `${this.keyPrefix}connection:${clientId}`,
      this.serializeObject(connectionState)
    );

    await this.redis.sadd(`${this.keyPrefix}connections:active`, clientId);
    await this.redis.expire(`${this.keyPrefix}connection:${clientId}`, 300); // 5 minute TTL for connections

    // Publish connection event
    await this.publishEvent('connections', {
      type: 'connection:established',
      clientId,
      socketId,
      timestamp: now
    });

    return connectionState;
  }

  async updateConnectionQuality(clientId: string, latency: number, packetLoss: number = 0): Promise<void> {
    let quality: ConnectionState['quality'] = 'excellent';
    
    if (latency > 500 || packetLoss > 10) {
      quality = 'critical';
    } else if (latency > 200 || packetLoss > 5) {
      quality = 'poor';
    } else if (latency > 100 || packetLoss > 2) {
      quality = 'good';
    }

    const now = new Date();
    await this.redis.hmset(
      `${this.keyPrefix}connection:${clientId}`,
      'quality', quality,
      'metrics.latency', latency.toString(),
      'metrics.packetLoss', packetLoss.toString(),
      'metrics.lastHeartbeat', now.toISOString()
    );

    await this.redis.expire(`${this.keyPrefix}connection:${clientId}`, 300);

    // Emit quality change if degraded
    if (quality === 'poor' || quality === 'critical') {
      await this.publishEvent('connections', {
        type: 'connection:quality:degraded',
        clientId,
        quality,
        latency,
        packetLoss,
        timestamp: now
      });
    }
  }

  async handleDisconnection(clientId: string): Promise<void> {
    const now = new Date();
    
    // Update connection state
    await this.redis.hmset(
      `${this.keyPrefix}connection:${clientId}`,
      'status', 'disconnected',
      'metrics.disconnectedAt', now.toISOString()
    );

    // Move from active to disconnected set
    await this.redis.srem(`${this.keyPrefix}connections:active`, clientId);
    await this.redis.sadd(`${this.keyPrefix}connections:disconnected`, clientId);

    // Keep state for potential reconnection
    await this.redis.expire(`${this.keyPrefix}connection:${clientId}`, 600); // 10 minutes

    await this.publishEvent('connections', {
      type: 'connection:lost',
      clientId,
      timestamp: now
    });
  }

  async handleReconnection(clientId: string, socketId: string): Promise<ConnectionState | null> {
    const data = await this.redis.hgetall(`${this.keyPrefix}connection:${clientId}`);
    
    if (!data || Object.keys(data).length === 0) {
      // New connection
      return this.createConnection(clientId, socketId);
    }

    const connection = this.deserializeObject(data) as ConnectionState;
    const now = new Date();

    connection.status = 'connected';
    connection.socketId = socketId;
    connection.metrics.reconnectCount++;
    connection.metrics.connectedAt = now;

    await this.redis.hset(
      `${this.keyPrefix}connection:${clientId}`,
      this.serializeObject(connection)
    );

    // Move back to active
    await this.redis.srem(`${this.keyPrefix}connections:disconnected`, clientId);
    await this.redis.sadd(`${this.keyPrefix}connections:active`, clientId);
    await this.redis.expire(`${this.keyPrefix}connection:${clientId}`, 300);

    await this.publishEvent('connections', {
      type: 'connection:restored',
      clientId,
      socketId,
      reconnectCount: connection.metrics.reconnectCount,
      timestamp: now
    });

    return connection;
  }

  /**
   * Health Monitoring
   */

  async getSystemHealth(): Promise<{
    farms: { active: number; stuck: number; errors: number };
    agents: { total: number; working: number; idle: number; failed: number };
    connections: { active: number; disconnected: number; degraded: number };
  }> {
    const activeFarms = await this.getActiveFarms();
    const now = Date.now();
    const stuckThreshold = 5 * 60 * 1000; // 5 minutes

    let stuckFarms = 0;
    let errorFarms = 0;
    let totalAgents = 0;
    let workingAgents = 0;
    let idleAgents = 0;
    let failedAgents = 0;

    for (const farm of activeFarms) {
      if (farm.status === FarmStatus.ERROR) {
        errorFarms++;
      } else if (farm.metrics.heartbeatTime) {
        const lastHeartbeat = new Date(farm.metrics.heartbeatTime).getTime();
        if (now - lastHeartbeat > stuckThreshold) {
          stuckFarms++;
        }
      }

      const agents = await this.getFarmAgents(farm.id);
      totalAgents += agents.length;
      
      for (const agent of agents) {
        if (agent.status === 'working') workingAgents++;
        else if (agent.status === 'idle') idleAgents++;
        else if (agent.status === 'error') failedAgents++;
      }
    }

    const activeConnections = await this.redis.scard(`${this.keyPrefix}connections:active`);
    const disconnectedConnections = await this.redis.scard(`${this.keyPrefix}connections:disconnected`);
    
    // Count degraded connections
    const activeConnectionIds = await this.redis.smembers(`${this.keyPrefix}connections:active`);
    let degradedConnections = 0;
    
    for (const clientId of activeConnectionIds) {
      const quality = await this.redis.hget(`${this.keyPrefix}connection:${clientId}`, 'quality');
      if (quality === 'poor' || quality === 'critical') {
        degradedConnections++;
      }
    }

    return {
      farms: {
        active: activeFarms.length,
        stuck: stuckFarms,
        errors: errorFarms
      },
      agents: {
        total: totalAgents,
        working: workingAgents,
        idle: idleAgents,
        failed: failedAgents
      },
      connections: {
        active: activeConnections,
        disconnected: disconnectedConnections,
        degraded: degradedConnections
      }
    };
  }

  /**
   * Cleanup and Maintenance
   */

  private startCleanupInterval() {
    this.cleanupInterval = setInterval(async () => {
      try {
        // Clean up expired states
        const activeFarms = await this.redis.smembers(`${this.keyPrefix}farms:active`);
        
        for (const farmId of activeFarms) {
          const exists = await this.redis.exists(`${this.keyPrefix}farm:${farmId}`);
          if (!exists) {
            // Remove from active set if state expired
            await this.redis.srem(`${this.keyPrefix}farms:active`, farmId);
          }
        }

        // Clean up orphaned agents
        const pattern = `${this.keyPrefix}agent:*`;
        const agentKeys = await this.redis.keys(pattern);
        
        for (const key of agentKeys) {
          const ttl = await this.redis.ttl(key);
          if (ttl === -1) {
            // No TTL set, set one
            await this.redis.expire(key, this.stateTTL);
          }
        }
      } catch (error) {
        console.error('[UnifiedRedisStateManager] Cleanup error:', error);
      }
    }, 60000); // Run every minute
  }

  private startHealthCheckInterval() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getSystemHealth();
        
        // Emit health status
        this.emit('health:check', health);
        
        // Alert on critical conditions
        if (health.farms.stuck > 0 || health.farms.errors > 0) {
          await this.publishEvent('farms', {
            type: 'health:alert',
            health,
            timestamp: new Date()
          });
        }
      } catch (error) {
        console.error('[UnifiedRedisStateManager] Health check error:', error);
      }
    }, 30000); // Run every 30 seconds
  }

  /**
   * Utility Methods
   */

  private async acquireLock(key: string): Promise<boolean> {
    const token = uuidv4();
    const result = await this.redis.set(key, token, 'PX', this.lockTTL, 'NX');
    return result === 'OK';
  }

  private async releaseLock(key: string): Promise<void> {
    await this.redis.del(key);
  }

  private async publishEvent(channel: string, event: any): Promise<void> {
    await this.publisher.publish(
      `${this.keyPrefix}events:${channel}`,
      JSON.stringify(event)
    );
  }

  private serializeObject(obj: any): Record<string, string> {
    const result: Record<string, string> = {};
    
    const flatten = (data: any, prefix = '') => {
      for (const [key, value] of Object.entries(data)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        
        if (value === null || value === undefined) {
          continue;
        } else if (value instanceof Date) {
          result[fullKey] = value.toISOString();
        } else if (typeof value === 'object' && !Array.isArray(value)) {
          flatten(value, fullKey);
        } else if (Array.isArray(value)) {
          result[fullKey] = JSON.stringify(value);
        } else {
          result[fullKey] = String(value);
        }
      }
    };
    
    flatten(obj);
    return result;
  }

  private deserializeObject(data: Record<string, string>): any {
    const result: any = {};
    
    for (const [key, value] of Object.entries(data)) {
      const keys = key.split('.');
      let current = result;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in current)) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      const lastKey = keys[keys.length - 1];
      
      try {
        // Try to parse as JSON (for arrays)
        if (value.startsWith('[') || value.startsWith('{')) {
          current[lastKey] = JSON.parse(value);
        }
        // Try to parse as Date
        else if (value.includes('T') && value.includes('Z')) {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            current[lastKey] = date;
          } else {
            current[lastKey] = value;
          }
        }
        // Parse booleans
        else if (value === 'true' || value === 'false') {
          current[lastKey] = value === 'true';
        }
        // Parse numbers
        else if (!isNaN(Number(value)) && value !== '') {
          current[lastKey] = Number(value);
        }
        // Keep as string
        else {
          current[lastKey] = value;
        }
      } catch {
        current[lastKey] = value;
      }
    }
    
    return result;
  }

  /**
   * Cleanup
   */

  async destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    await this.subscriber.disconnect();
    await this.publisher.disconnect();
    
    this.removeAllListeners();
    console.log('[UnifiedRedisStateManager] Destroyed');
  }
}

// Export singleton instance
export default UnifiedRedisStateManager;